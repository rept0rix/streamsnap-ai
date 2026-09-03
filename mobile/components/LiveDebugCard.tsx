import { Text, View, StyleSheet } from "react-native";
import type { LiveScanState } from "../modules/live-scan/src";

function ago(ts: number | null): string {
  if (!ts) return "—";
  const seconds = Math.max(0, Math.round(Date.now() / 1000 - ts));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} selectable>
        {value}
      </Text>
    </View>
  );
}

export function LiveDebugCard({ state }: { state: LiveScanState }) {
  const live = state.broadcasting || state.screenCaptured;
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Live scan debug</Text>
        <View style={[styles.pill, live ? styles.pillOn : styles.pillOff]}>
          <Text style={styles.pillText}>{live ? "LIVE" : "IDLE"}</Text>
        </View>
      </View>
      <Row label="Phase" value={state.lastPhase || "—"} />
      <Row
        label="Counts"
        value={`sent ${state.scanCount} · ok ${state.okCount} · fail ${state.failCount} · skip ${state.skipCount} · finds ${state.findCount}`}
      />
      <Row label="HTTP" value={state.lastStatus ? String(state.lastStatus) : "—"} />
      <Row label="Error" value={state.lastError || "none"} />
      <Row label="Last frame" value={ago(state.lastFrameAt)} />
      <Row
        label="JPEG"
        value={state.lastJpegBytes ? `${Math.round(state.lastJpegBytes / 1024)} KB` : "—"}
      />
      <Row label="Signed in" value={state.hasToken ? "yes" : "no"} />
      <Row label="Install" value={state.installId || "—"} />
      <Row label="Worker" value={state.workerUrl || "—"} />
      {state.lastBody ? (
        <View style={styles.bodyBox}>
          <Text style={styles.bodyLabel}>Last worker body</Text>
          <Text style={styles.body} selectable>
            {state.lastBody}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 24,
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1E2533"
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12
  },
  title: { color: "#F8FAFC", fontSize: 15, fontWeight: "700" },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  pillOn: { backgroundColor: "#14532D" },
  pillOff: { backgroundColor: "#1E2533" },
  pillText: { color: "#F8FAFC", fontSize: 11, fontWeight: "800" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 5
  },
  label: { color: "#64748B", fontSize: 12, fontWeight: "600", width: 84 },
  value: { color: "#E2E8F0", fontSize: 12, flex: 1, textAlign: "right" },
  bodyBox: {
    marginTop: 10,
    backgroundColor: "#0B0F17",
    borderRadius: 10,
    padding: 10
  },
  bodyLabel: { color: "#64748B", fontSize: 11, marginBottom: 6, fontWeight: "600" },
  body: { color: "#FCA5A5", fontSize: 11, lineHeight: 16, fontFamily: "Menlo" }
});
