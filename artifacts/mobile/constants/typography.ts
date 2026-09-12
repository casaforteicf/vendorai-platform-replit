import { VENDOR_BRAND } from "../../../lib/vendor-brand/src/tokens";

export const typography = {
  family: {
    regular: "Inter_400Regular",
    medium: "Inter_500Medium",
    semibold: "Inter_600SemiBold",
    bold: "Inter_700Bold",
  },
  size: VENDOR_BRAND.typography.mobile,
} as const;
