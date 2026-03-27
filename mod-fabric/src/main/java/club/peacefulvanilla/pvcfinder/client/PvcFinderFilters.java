package club.peacefulvanilla.pvcfinder.client;

import java.util.Locale;

public record PvcFinderFilters(
        String query,
        SortMode sortMode,
        boolean inStockOnly,
        boolean includeShulker,
        SearchScope searchScope,
        TradeIntent tradeIntent
) {
    public String normalizedQuery() {
        return query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
    }

    public enum SortMode {
        RELEVANCE("Relevance"),
        PRICE("Lowest Price"),
        STOCK("Most Stock"),
        ALPHA("A-Z");

        private final String label;

        SortMode(String label) {
            this.label = label;
        }

        public String label() {
            return label;
        }
    }

    public enum SearchScope {
        ITEM("Item"),
        SHOP("Shop"),
        PLAYER("Player"),
        VARIANT("Variants");

        private final String label;

        SearchScope(String label) {
            this.label = label;
        }

        public String label() {
            return label;
        }
    }

    public enum TradeIntent {
        BOTH("Both"),
        SELL("Selling"),
        BUY("Buying");

        private final String label;

        TradeIntent(String label) {
            this.label = label;
        }

        public String label() {
            return label;
        }
    }
}
