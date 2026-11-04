-- 001_init.sql: core schema.
-- Money rules: every price/quantity/fee is NUMERIC(36,18). Never FLOAT.

CREATE TABLE users (
                       id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                       email         text NOT NULL,
                       password_hash text NOT NULL,
                       status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
                       created_at    timestamptz NOT NULL DEFAULT now(),
                       updated_at    timestamptz NOT NULL DEFAULT now()
);
-- Case-insensitive uniqueness: "A@x.com" and "a@x.com" are the same account.
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

-- Each user links their OWN Binance API keys (non-custodial design).
CREATE TABLE exchange_credentials (
                                      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                                      user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
                                      environment      text NOT NULL CHECK (environment IN ('testnet', 'live')),
                                      api_key          text NOT NULL,
                                      encrypted_secret text NOT NULL,  -- AES-256-GCM ciphertext, never plaintext
    -- The database itself refuses keys that can withdraw funds.
                                      can_withdraw     boolean NOT NULL DEFAULT false CHECK (can_withdraw = false),
                                      last_verified_at timestamptz,
                                      created_at       timestamptz NOT NULL DEFAULT now(),
                                      updated_at       timestamptz NOT NULL DEFAULT now(),
                                      UNIQUE (user_id, environment)
);

-- Tradable pairs (e.g. BTCUSDT) and the exchange's trading rules, cached from Binance.
CREATE TABLE assets (
                        symbol       text PRIMARY KEY,
                        base_asset   text NOT NULL,
                        quote_asset  text NOT NULL,
                        tick_size    numeric(36, 18) NOT NULL CHECK (tick_size > 0),     -- price step
                        step_size    numeric(36, 18) NOT NULL CHECK (step_size > 0),     -- quantity step
                        min_qty      numeric(36, 18) NOT NULL CHECK (min_qty >= 0),
                        min_notional numeric(36, 18) NOT NULL CHECK (min_notional >= 0), -- minimum price * quantity
                        status       text NOT NULL,
                        updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orders (
                        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                        user_id           uuid NOT NULL REFERENCES users (id),
                        environment       text NOT NULL CHECK (environment IN ('testnet', 'live')),
                        symbol            text NOT NULL REFERENCES assets (symbol),
                        side              text NOT NULL CHECK (side IN ('BUY', 'SELL')),
                        type              text NOT NULL CHECK (type IN ('MARKET', 'LIMIT')),
                        quantity          numeric(36, 18) NOT NULL CHECK (quantity > 0),
                        price             numeric(36, 18) CHECK (price > 0),
                        filled_quantity   numeric(36, 18) NOT NULL DEFAULT 0 CHECK (filled_quantity >= 0),
                        status            text NOT NULL DEFAULT 'PENDING_SUBMIT' CHECK (status IN (
                                                                                                   'PENDING_SUBMIT', 'NEW', 'PARTIALLY_FILLED', 'FILLED',
                                                                                                   'CANCELED', 'REJECTED', 'EXPIRED', 'UNKNOWN')),
    -- Our own unique ID, sent to Binance so a retried request can never create a duplicate order.
                        client_order_id   text NOT NULL,
                        exchange_order_id text,
                        reject_reason     text,
                        created_at        timestamptz NOT NULL DEFAULT now(),
                        updated_at        timestamptz NOT NULL DEFAULT now(),
                        CONSTRAINT orders_client_order_id_key UNIQUE (client_order_id),
                        CONSTRAINT orders_price_matches_type CHECK (
                            (type = 'LIMIT' AND price IS NOT NULL) OR (type = 'MARKET' AND price IS NULL)
                            ),
                        CONSTRAINT orders_filled_within_quantity CHECK (filled_quantity <= quantity)
);
CREATE INDEX orders_user_created_idx ON orders (user_id, created_at DESC);
CREATE INDEX orders_open_idx ON orders (status)
    WHERE status IN ('PENDING_SUBMIT', 'NEW', 'PARTIALLY_FILLED', 'UNKNOWN');
CREATE UNIQUE INDEX orders_exchange_order_key
    ON orders (user_id, environment, symbol, exchange_order_id)
    WHERE exchange_order_id IS NOT NULL;

-- Our ledger: one immutable row per execution.
CREATE TABLE fills (
                       id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                       order_id          uuid NOT NULL REFERENCES orders (id),
                       user_id           uuid NOT NULL REFERENCES users (id),
                       environment       text NOT NULL CHECK (environment IN ('testnet', 'live')),
                       symbol            text NOT NULL REFERENCES assets (symbol),
                       price             numeric(36, 18) NOT NULL CHECK (price > 0),
                       quantity          numeric(36, 18) NOT NULL CHECK (quantity > 0),
                       fee               numeric(36, 18) NOT NULL DEFAULT 0 CHECK (fee >= 0),
                       fee_asset         text,
                       exchange_trade_id text NOT NULL,
                       executed_at       timestamptz NOT NULL,
                       created_at        timestamptz NOT NULL DEFAULT now(),
    -- Makes recording a fill idempotent: seeing the same trade twice cannot double-count it.
                       CONSTRAINT fills_trade_unique UNIQUE (user_id, environment, symbol, exchange_trade_id)
);
CREATE INDEX fills_order_idx ON fills (order_id);
CREATE INDEX fills_user_executed_idx ON fills (user_id, executed_at DESC);

-- Append-only: the database itself refuses to change or delete a fill.
CREATE FUNCTION prevent_fill_mutation() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'fills is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER fills_append_only
    BEFORE UPDATE OR DELETE ON fills
  FOR EACH ROW EXECUTE FUNCTION prevent_fill_mutation();

-- Derived summary of fills (can always be rebuilt from `fills`).
-- avg_entry_price and realized_pnl are denominated in the symbol's quote asset (e.g. USDT).
CREATE TABLE positions (
                           user_id         uuid NOT NULL REFERENCES users (id),
                           environment     text NOT NULL CHECK (environment IN ('testnet', 'live')),
                           symbol          text NOT NULL REFERENCES assets (symbol),
                           quantity        numeric(36, 18) NOT NULL DEFAULT 0 CHECK (quantity >= 0),  -- spot: no shorting
                           avg_entry_price numeric(36, 18) NOT NULL DEFAULT 0 CHECK (avg_entry_price >= 0),
                           realized_pnl    numeric(36, 18) NOT NULL DEFAULT 0,
                           updated_at      timestamptz NOT NULL DEFAULT now(),
                           PRIMARY KEY (user_id, environment, symbol)
);