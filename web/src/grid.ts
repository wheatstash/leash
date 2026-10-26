import { themeQuartz } from "ag-grid-community";

// One AG Grid theme for every table, tuned to the console's tokens.
export const gridTheme = themeQuartz.withParams({
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: 13,
  accentColor: "#0062D6",
  foregroundColor: "#0B0D12",
  backgroundColor: "#FFFFFF",
  headerBackgroundColor: "#F5F7FA",
  headerFontWeight: 600,
  borderColor: "#DADDE3",
  rowBorder: { color: "#ECEEF2" },
  wrapperBorder: false,
  wrapperBorderRadius: 12,
  rowHoverColor: "#F5F7FA",
  spacing: 7,
});
