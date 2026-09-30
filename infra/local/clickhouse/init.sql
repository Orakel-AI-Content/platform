-- Analytics Engine local (ADR 0014 da raiz): a tabela events no formato do dataset do AE,
-- para o SQL do agregador rodar igual (FROM events, index1, blobN, doubleN,
-- _sample_interval, timestamp). O layout dos campos é o do @orakel/events (layout.ts).
-- Rodado pelo entrypoint do ClickHouse no primeiro start e pelo spike (edge-local).
CREATE DATABASE IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS analytics.events
(
    timestamp DateTime64(3, 'UTC') DEFAULT now64(3),
    dataset LowCardinality(String) DEFAULT 'events',
    index1 String,
    blob1 String DEFAULT '', blob2 String DEFAULT '', blob3 String DEFAULT '', blob4 String DEFAULT '',
    blob5 String DEFAULT '', blob6 String DEFAULT '', blob7 String DEFAULT '', blob8 String DEFAULT '',
    blob9 String DEFAULT '', blob10 String DEFAULT '', blob11 String DEFAULT '', blob12 String DEFAULT '',
    blob13 String DEFAULT '', blob14 String DEFAULT '', blob15 String DEFAULT '', blob16 String DEFAULT '',
    blob17 String DEFAULT '', blob18 String DEFAULT '', blob19 String DEFAULT '', blob20 String DEFAULT '',
    double1 Float64 DEFAULT 0, double2 Float64 DEFAULT 0, double3 Float64 DEFAULT 0, double4 Float64 DEFAULT 0,
    double5 Float64 DEFAULT 0, double6 Float64 DEFAULT 0, double7 Float64 DEFAULT 0, double8 Float64 DEFAULT 0,
    double9 Float64 DEFAULT 0, double10 Float64 DEFAULT 0, double11 Float64 DEFAULT 0, double12 Float64 DEFAULT 0,
    double13 Float64 DEFAULT 0, double14 Float64 DEFAULT 0, double15 Float64 DEFAULT 0, double16 Float64 DEFAULT 0,
    double17 Float64 DEFAULT 0, double18 Float64 DEFAULT 0, double19 Float64 DEFAULT 0, double20 Float64 DEFAULT 0,
    -- Sem amostragem local: cada linha vale um evento (no AE, o peso da amostra).
    _sample_interval UInt32 DEFAULT 1
)
ENGINE = MergeTree
ORDER BY (index1, timestamp);
