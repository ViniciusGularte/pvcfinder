package club.peacefulvanilla.pvcfinder.data;

import java.util.List;
import java.util.Locale;
import java.util.ArrayList;
import java.util.stream.Collectors;

public record PvcOffer(
        String id,
        PvcShop shop,
        PvcTradeItem resultItem,
        List<PvcTradeItem> costs,
        int stock,
        String searchText
) {
    public String title() {
        return resultItem.shortLabel();
    }

    public String priceLabel() {
        if (costs.isEmpty()) {
            return "No price listed";
        }
        return costs.stream().map(PvcTradeItem::shortLabel).collect(Collectors.joining(" + "));
    }

    public String stockLabel() {
        return stock > 0 ? "Stock: " + stock : "Sold out";
    }

    public boolean matches(String query) {
        if (query == null || query.isBlank()) {
            return true;
        }
        return searchText.contains(query.toLowerCase(Locale.ROOT));
    }

    public String itemSearchText() {
        return resultItem.basicSearchText();
    }

    public String sellShulkerSearchText() {
        return resultItem.shulkerSearchText();
    }

    public String variantSearchText() {
        return resultItem.searchText();
    }

    public String shopSearchText() {
        return shop.displayName().toLowerCase(Locale.ROOT);
    }

    public String ownerSearchText() {
        return shop.displayOwner().toLowerCase(Locale.ROOT);
    }

    public String costSearchText() {
        return costs.stream().map(PvcTradeItem::basicSearchText).collect(Collectors.joining(" "));
    }

    public String costShulkerSearchText() {
        return costs.stream().map(PvcTradeItem::shulkerSearchText).collect(Collectors.joining(" "));
    }

    public String costVariantSearchText() {
        return costs.stream().map(PvcTradeItem::searchText).collect(Collectors.joining(" "));
    }

    public List<String> sellSuggestionLabels(boolean includeShulker) {
        java.util.stream.Stream<String> base = java.util.stream.Stream.of(resultItem.displayName());
        if (includeShulker) {
            base = java.util.stream.Stream.concat(base, resultItem.shulkerExactLabels().stream());
        }
        return base
                .filter(label -> label != null && !label.isBlank())
                .distinct()
                .toList();
    }

    public List<String> buySuggestionLabels(boolean includeShulker) {
        java.util.stream.Stream<String> base = costs.stream().map(PvcTradeItem::displayName);
        if (includeShulker) {
            base = java.util.stream.Stream.concat(base, costs.stream().flatMap(cost -> cost.shulkerExactLabels().stream()));
        }
        return base
                .filter(label -> label != null && !label.isBlank())
                .distinct()
                .toList();
    }

    public boolean hasShulkerItem() {
        if (resultItem.isShulkerBox()) {
            return true;
        }
        return costs.stream().anyMatch(PvcTradeItem::isShulkerBox);
    }

    public boolean hasPreviewContents() {
        if (resultItem.hasPreviewContents()) {
            return true;
        }
        return costs.stream().anyMatch(PvcTradeItem::hasPreviewContents);
    }

    public List<String> previewContents() {
        List<String> lines = new ArrayList<>();
        appendPreview(lines, "YOU GET", resultItem);
        for (PvcTradeItem cost : costs) {
            appendPreview(lines, "YOU PAY", cost);
        }
        return List.copyOf(lines);
    }

    public int totalPriceAmount() {
        return costs.stream().mapToInt(cost -> Math.max(cost.amount(), 1)).sum();
    }

    private static void appendPreview(List<String> lines, String label, PvcTradeItem item) {
        if (!item.hasPreviewContents()) {
            return;
        }

        if (!lines.isEmpty()) {
            lines.add("");
        }
        lines.add(label + " - " + item.shortLabel());
        item.previewContents().forEach(entry -> lines.add("  " + entry));
    }
}
