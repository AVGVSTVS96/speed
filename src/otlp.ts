export type Value = string | number | boolean | undefined;

export type Event = {
  service: string;
  at: number;
  name: string;
  attrs: Record<string, Value>;
};

type AnyValue = {
  stringValue?: string;
  intValue?: string | number;
  doubleValue?: number;
  boolValue?: boolean;
};
type KeyValue = { key: string; value?: AnyValue };
type LogRecord = { timeUnixNano?: string; observedTimeUnixNano?: string; attributes?: KeyValue[] };

export type LogsPayload = {
  resourceLogs?: {
    resource?: { attributes?: KeyValue[] };
    scopeLogs?: { logRecords?: LogRecord[] }[];
  }[];
};

const value = (v: AnyValue = {}): Value =>
  v.stringValue ?? (v.intValue === undefined ? (v.doubleValue ?? v.boolValue) : Number(v.intValue));

const attributes = (kvs: KeyValue[] = []) => Object.fromEntries(kvs.map((kv) => [kv.key, value(kv.value)]));

const millis = (record: LogRecord) => {
  const nanos =
    record.timeUnixNano && record.timeUnixNano !== "0" ? record.timeUnixNano : record.observedTimeUnixNano;
  return Number(BigInt(nanos ?? "0") / 1_000_000n);
};

export const events = (payload: LogsPayload): Event[] =>
  (payload.resourceLogs ?? []).flatMap(({ resource, scopeLogs = [] }) => {
    const service = String(attributes(resource?.attributes)["service.name"] ?? "");
    return scopeLogs.flatMap(({ logRecords = [] }) =>
      logRecords.map((record) => {
        const attrs = attributes(record.attributes);
        return { service, at: millis(record), name: String(attrs["event.name"] ?? ""), attrs };
      }),
    );
  });
