import { themeQuartz } from "ag-grid-community";

// One AG Grid theme for every table, tuned to the console's tokens.
export const gridTheme = themeQuartz.withParams({
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: 13,
  accentColor: "#4F46E5",
  foregroundColor: "#18181B",
  backgroundColor: "#FFFFFF",
  headerBackgroundColor: "#FAFAFA",
  headerFontWeight: 600,
  borderColor: "#E4E4E7",
  rowBorder: { color: "#F4F4F5" },
  wrapperBorder: false,
  wrapperBorderRadius: 12,
  rowHoverColor: "#F4F4F5",
  spacing: 7,
});
