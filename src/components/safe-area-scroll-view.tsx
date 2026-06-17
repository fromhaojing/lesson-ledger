import { ScrollView, type ScrollViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type SafeAreaScrollViewProps = ScrollViewProps & {
  bottomOffset?: number;
};

export function SafeAreaScrollView({ bottomOffset = 96, contentContainerStyle, ...props }: SafeAreaScrollViewProps) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      {...props}
      contentContainerStyle={[contentContainerStyle, { paddingBottom: insets.bottom + bottomOffset }]}
    />
  );
}
