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
