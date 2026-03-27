package club.peacefulvanilla.pvcfinder.client;

import club.peacefulvanilla.pvcfinder.PvcFinderMod;
import club.peacefulvanilla.pvcfinder.data.PvcOffer;
import club.peacefulvanilla.pvcfinder.data.PvcSnapshot;
import club.peacefulvanilla.pvcfinder.data.PvcSnapshotParser;
import net.minecraft.client.Minecraft;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Stream;

public final class PvcFinderDataStore {
    private static final URI LIVE_DATA_URI = URI.create("https://web.peacefulvanilla.club/shops/data.json");
    private static final Duration LIVE_TIMEOUT = Duration.ofSeconds(15);
    private static final Duration STALE_AFTER = Duration.ofMinutes(15);
    private static final Duration AUTO_REFRESH_COOLDOWN = Duration.ofSeconds(45);

    private final PvcSnapshotParser parser = new PvcSnapshotParser();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
    private final ExecutorService refreshExecutor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "pvcfinder-refresh");
        thread.setDaemon(true);
        return thread;
    });

    private PvcSnapshot snapshot;
    private SnapshotSource snapshotSource = SnapshotSource.BUNDLED;
    private String errorMessage;
    private String refreshErrorMessage;
    private Instant dumpedAt;
    private Instant lastRefreshAttemptAt;
    private boolean refreshing;
    private long revision;

    public void ensureLoaded(Minecraft minecraft) {
        if (snapshot == null && errorMessage == null) {
            try {
                LoadResult local = loadCachedSnapshot(minecraft);
                if (local == null) {
                    local = loadBundledSnapshot(minecraft);
                }
                applyLoadedSnapshot(local);
            } catch (IOException error) {
                errorMessage = messageFor(error);
                revision++;
            }
        }

        if (snapshot != null) {
            refreshAsync(minecraft, false);
        }
    }

    public void reload(Minecraft minecraft) {
        snapshot = null;
        errorMessage = null;
        refreshErrorMessage = null;
        dumpedAt = null;
        snapshotSource = SnapshotSource.BUNDLED;
        revision++;
        ensureLoaded(minecraft);
    }

    public void refreshAsync(Minecraft minecraft, boolean manual) {
        if (refreshing) {
            return;
        }
        if (!manual && !shouldAutoRefresh()) {
            return;
        }

        refreshing = true;
        refreshErrorMessage = null;
        lastRefreshAttemptAt = Instant.now();
        revision++;

        CompletableFuture.supplyAsync(() -> fetchLiveSnapshot(minecraft), refreshExecutor)
                .whenComplete((result, throwable) -> minecraft.execute(() -> finishRefresh(result, throwable)));
    }

    public List<PvcOffer> filterOffers(PvcFinderFilters filters) {
        if (snapshot == null) {
            return List.of();
        }
        return snapshot.offers().stream()
                .filter(offer -> matchesFilters(offer, filters))
                .sorted(buildComparator(filters))
                .toList();
    }

    public int offerCount() {
        return snapshot == null ? 0 : snapshot.offers().size();
    }

    public List<PvcFinderSuggestion> suggestions(PvcFinderFilters filters, int limit) {
        if (snapshot == null) {
            return List.of();
        }

        if (filters.searchScope() != PvcFinderFilters.SearchScope.ITEM) {
            return List.of();
        }

        String query = filters.normalizedQuery();
        if (query.isBlank()) {
            return List.of();
        }

        Map<String, PvcFinderSuggestion> unique = new LinkedHashMap<>();
        snapshot.offers().stream()
                .filter(offer -> matchesFilters(offer, new PvcFinderFilters("", filters.sortMode(), filters.inStockOnly(), filters.includeShulker(), filters.searchScope(), filters.tradeIntent())))
                .flatMap(offer -> suggestionStream(offer, filters))
                .filter(suggestion -> suggestion.label() != null && !suggestion.label().isBlank())
                .filter(suggestion -> matchesSuggestionQuery(suggestion.label(), query))
                .sorted(Comparator
                        .comparingInt((PvcFinderSuggestion suggestion) -> suggestionScore(suggestion.label(), query))
                        .reversed()
                        .thenComparingInt(suggestion -> suggestion.label().length())
                        .thenComparing(PvcFinderSuggestion::label, String.CASE_INSENSITIVE_ORDER))
                .limit(limit * 4L)
                .forEach(suggestion -> unique.putIfAbsent(suggestion.label().toLowerCase(Locale.ROOT), suggestion));

        return unique.values().stream().limit(limit).toList();
    }

    public List<PvcFinderSuggestion> itemCatalogSuggestions(String query, int limit) {
        if (snapshot == null) {
            return List.of();
        }

        String normalizedQuery = normalize(query);
        Map<String, PvcFinderSuggestion> unique = new LinkedHashMap<>();
        snapshot.offers().stream()
                .flatMap(offer -> offer.sellSuggestionLabels(true).stream().map(label -> new PvcFinderSuggestion(label, "Item")))
                .filter(suggestion -> suggestion.label() != null && !suggestion.label().isBlank())
                .filter(suggestion -> normalizedQuery.isBlank() || matchesSuggestionQuery(suggestion.label(), normalizedQuery))
                .sorted(Comparator
                        .comparingInt((PvcFinderSuggestion suggestion) -> suggestionScore(suggestion.label(), normalizedQuery))
                        .reversed()
                        .thenComparingInt(suggestion -> suggestion.label().length())
                        .thenComparing(PvcFinderSuggestion::label, String.CASE_INSENSITIVE_ORDER))
                .forEach(suggestion -> unique.putIfAbsent(normalize(suggestion.label()), suggestion));

        return unique.values().stream().limit(limit).toList();
    }

    public String dumpedAt() {
        return snapshot == null ? "unknown" : snapshot.dumpedAt();
    }

    public String errorMessage() {
        return errorMessage;
    }

    public String refreshErrorMessage() {
        return refreshErrorMessage;
    }

    public boolean isRefreshing() {
        return refreshing;
    }

    public boolean isStale() {
        if (dumpedAt == null) {
            return snapshot != null;
        }
        return Duration.between(dumpedAt, Instant.now()).compareTo(STALE_AFTER) > 0;
    }

    public long revision() {
        return revision;
    }

    public SnapshotSource snapshotSource() {
        return snapshotSource;
    }

    public String marketStatusLabel() {
        if (refreshing) {
            return "Refreshing...";
        }
        if (snapshot == null) {
            return "Loading...";
        }

        String age = snapshotAgeLabel();
        if (age.equals("?")) {
            return snapshotSource.label();
        }
        if (isStale()) {
            return snapshotSource == SnapshotSource.CACHE
                    ? "STALE CACHE " + age
                    : "STALE " + age;
        }
        return snapshotSource.label() + " " + age;
    }

    private boolean shouldAutoRefresh() {
        if (snapshot == null) {
            return false;
        }
        if (lastRefreshAttemptAt != null
                && Duration.between(lastRefreshAttemptAt, Instant.now()).compareTo(AUTO_REFRESH_COOLDOWN) < 0) {
            return false;
        }
        return snapshotSource != SnapshotSource.LIVE || isStale();
    }

    private LoadResult loadBundledSnapshot(Minecraft minecraft) throws IOException {
        return new LoadResult(parser.load(minecraft.getResourceManager()), SnapshotSource.BUNDLED);
    }

    private LoadResult loadCachedSnapshot(Minecraft minecraft) throws IOException {
        Path cachePath = cachePath(minecraft);
        if (!Files.exists(cachePath)) {
            return null;
        }
        String rawJson = Files.readString(cachePath, StandardCharsets.UTF_8);
        return new LoadResult(parser.parse(rawJson), SnapshotSource.CACHE);
    }

    private LoadResult fetchLiveSnapshot(Minecraft minecraft) {
        try {
            HttpRequest request = HttpRequest.newBuilder(LIVE_DATA_URI)
                    .timeout(LIVE_TIMEOUT)
                    .header("accept", "application/json,text/plain,*/*")
                    .header("accept-language", "en-US,en;q=0.9")
                    .header("cache-control", "no-cache")
                    .header("pragma", "no-cache")
                    .header("referer", "https://web.peacefulvanilla.club/")
                    .header("origin", "https://web.peacefulvanilla.club")
                    .header("user-agent", "Mozilla/5.0 (compatible; PVCFinderMod/1.0; +https://web.peacefulvanilla.club/)")
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IOException("PVC upstream returned " + response.statusCode());
            }

            String rawJson = response.body();
            PvcSnapshot liveSnapshot = parser.parse(rawJson);
            Path cachePath = cachePath(minecraft);
            Files.createDirectories(cachePath.getParent());
            Files.writeString(cachePath, rawJson, StandardCharsets.UTF_8);
            return new LoadResult(liveSnapshot, SnapshotSource.LIVE);
        } catch (Exception error) {
            throw new RuntimeException(error);
        }
    }

    private void finishRefresh(LoadResult result, Throwable throwable) {
        refreshing = false;
        if (throwable == null && result != null) {
            applyLoadedSnapshot(result);
            refreshErrorMessage = null;
            revision++;
            return;
        }

        Throwable cause = throwable instanceof RuntimeException runtime && runtime.getCause() != null
                ? runtime.getCause()
                : throwable;
        refreshErrorMessage = messageFor(cause);
        if (snapshot == null) {
            errorMessage = refreshErrorMessage;
        }
        revision++;
    }

    private void applyLoadedSnapshot(LoadResult result) {
        snapshot = result.snapshot();
        snapshotSource = result.source();
        dumpedAt = parseDumpedAt(result.snapshot().dumpedAt());
        errorMessage = null;
    }

    private Path cachePath(Minecraft minecraft) {
        return minecraft.gameDirectory.toPath()
                .resolve("config")
                .resolve(PvcFinderMod.MOD_ID)
                .resolve("shops-cache.json");
    }

    private String snapshotAgeLabel() {
        if (dumpedAt == null) {
            return "?";
        }

        Duration age = Duration.between(dumpedAt, Instant.now());
        if (age.isNegative()) {
            age = Duration.ZERO;
        }

        long seconds = age.getSeconds();
        if (seconds < 60) {
            return "now";
        }
        long minutes = age.toMinutes();
        if (minutes < 60) {
            return minutes + "m";
        }
        long hours = age.toHours();
        if (hours < 48) {
            return hours + "h";
        }
        return age.toDays() + "d";
    }

    private static Instant parseDumpedAt(String dumpedAt) {
        if (dumpedAt == null || dumpedAt.isBlank() || dumpedAt.equalsIgnoreCase("unknown")) {
            return null;
        }

        try {
            return Instant.parse(dumpedAt);
        } catch (DateTimeParseException ignored) {
        }
        try {
            return OffsetDateTime.parse(dumpedAt).toInstant();
        } catch (DateTimeParseException ignored) {
        }
        try {
            return LocalDateTime.parse(dumpedAt).atZone(ZoneId.systemDefault()).toInstant();
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }

    private static String messageFor(Throwable error) {
        if (error == null) {
            return "Unknown error";
        }
        if (error.getMessage() != null && !error.getMessage().isBlank()) {
            return error.getMessage();
        }
        return error.getClass().getSimpleName();
    }

    private static boolean matchesFilters(PvcOffer offer, PvcFinderFilters filters) {
        if (filters.inStockOnly() && offer.stock() <= 0) {
            return false;
        }
        if (!filters.includeShulker() && offer.hasShulkerItem()) {
            return false;
        }

        String query = filters.normalizedQuery();
        if (query.isBlank()) {
            return true;
        }

        String[] terms = tokenize(query);
        return switch (filters.searchScope()) {
            case ITEM -> switch (filters.tradeIntent()) {
                case BOTH -> matchesTokenTerms(offer.itemSearchText(), terms)
                        || matchesTokenTerms(offer.costSearchText(), terms)
                        || (filters.includeShulker() && matchesTokenTerms(offer.sellShulkerSearchText(), terms))
                        || (filters.includeShulker() && matchesTokenTerms(offer.costShulkerSearchText(), terms));
                case SELL -> matchesTokenTerms(offer.itemSearchText(), terms)
                        || (filters.includeShulker() && matchesTokenTerms(offer.sellShulkerSearchText(), terms));
                case BUY -> matchesTokenTerms(offer.costSearchText(), terms)
                        || (filters.includeShulker() && matchesTokenTerms(offer.costShulkerSearchText(), terms));
            };
            case SHOP -> matchesTokenTerms(offer.shopSearchText(), terms);
            case PLAYER -> matchesTokenTerms(offer.ownerSearchText(), terms);
            case VARIANT -> switch (filters.tradeIntent()) {
                case BOTH -> matchesBroadTerms(offer.searchText(), terms)
                        || (filters.includeShulker() && matchesBroadTerms(offer.sellShulkerSearchText(), terms))
                        || (filters.includeShulker() && matchesBroadTerms(offer.costShulkerSearchText(), terms));
                case SELL -> matchesBroadTerms(offer.variantSearchText(), terms);
                case BUY -> matchesBroadTerms(offer.costVariantSearchText(), terms);
            };
        };
    }

    private static Comparator<PvcOffer> buildComparator(PvcFinderFilters filters) {
        return switch (filters.sortMode()) {
            case PRICE -> Comparator
                    .comparingInt(PvcOffer::totalPriceAmount)
                    .thenComparing(Comparator.comparing(PvcOffer::title, String.CASE_INSENSITIVE_ORDER));
            case STOCK -> Comparator
                    .comparingInt(PvcOffer::stock)
                    .reversed()
                    .thenComparing(Comparator.comparing(PvcOffer::title, String.CASE_INSENSITIVE_ORDER));
            case ALPHA -> Comparator.comparing(PvcOffer::title, String.CASE_INSENSITIVE_ORDER);
            case RELEVANCE -> Comparator
                    .comparingInt((PvcOffer offer) -> relevanceScore(offer, filters))
                    .reversed()
                    .thenComparing(Comparator.comparingInt(PvcOffer::stock).reversed())
                    .thenComparing(Comparator.comparing(PvcOffer::title, String.CASE_INSENSITIVE_ORDER));
        };
    }

    private static int relevanceScore(PvcOffer offer, PvcFinderFilters filters) {
        String query = filters.normalizedQuery();
        if (query.isBlank()) {
            return offer.stock();
        }

        return switch (filters.searchScope()) {
            case ITEM -> switch (filters.tradeIntent()) {
                case BOTH -> bestScore(
                        query,
                        offer.itemSearchText(),
                        offer.costSearchText(),
                        filters.includeShulker() ? offer.sellShulkerSearchText() : "",
                        filters.includeShulker() ? offer.costShulkerSearchText() : "",
                        offer.shopSearchText(),
                        offer.ownerSearchText()
                );
                case SELL -> bestScore(
                        query,
                        offer.itemSearchText(),
                        filters.includeShulker() ? offer.sellShulkerSearchText() : "",
                        offer.shopSearchText(),
                        offer.ownerSearchText()
                );
                case BUY -> bestScore(
                        query,
                        offer.costSearchText(),
                        filters.includeShulker() ? offer.costShulkerSearchText() : "",
                        offer.shopSearchText(),
                        offer.ownerSearchText()
                );
            };
            case SHOP -> bestScore(query, offer.shopSearchText(), offer.title().toLowerCase(Locale.ROOT));
            case PLAYER -> bestScore(query, offer.ownerSearchText(), offer.shopSearchText());
            case VARIANT -> switch (filters.tradeIntent()) {
                case BOTH -> bestScore(
                        query,
                        offer.searchText(),
                        offer.variantSearchText(),
                        offer.costVariantSearchText(),
                        filters.includeShulker() ? offer.sellShulkerSearchText() : "",
                        filters.includeShulker() ? offer.costShulkerSearchText() : ""
                );
                case SELL -> bestScore(query, offer.variantSearchText(), offer.shopSearchText());
                case BUY -> bestScore(query, offer.costVariantSearchText(), offer.shopSearchText());
            };
        };
    }

    private static int bestScore(String query, String... haystacks) {
        int best = 0;
        for (String haystack : haystacks) {
            best = Math.max(best, scoreMatch(query, haystack));
        }
        return best;
    }

    private static int scoreMatch(String query, String haystack) {
        if (haystack == null || haystack.isBlank() || query == null || query.isBlank()) {
            return 0;
        }

        String normalizedHaystack = normalize(haystack);
        String normalizedQuery = normalize(query);
        String[] terms = tokenize(normalizedQuery);
        List<String> tokens = tokensOf(normalizedHaystack);
        if (tokens.isEmpty()) {
            return 0;
        }

        if (tokens.stream().anyMatch(token -> token.equals(normalizedQuery))) {
            return 200;
        }

        boolean allPrefix = true;
        int score = 0;
        for (String term : terms) {
            boolean exact = tokens.stream().anyMatch(token -> token.equals(term));
            boolean prefix = !exact && tokens.stream().anyMatch(token -> token.startsWith(term));
            if (exact) {
                score += 34;
            } else if (prefix) {
                score += 26;
            } else {
                allPrefix = false;
            }
        }

        if (allPrefix && terms.length > 0) {
            return 160;
        }
        if (normalizedHaystack.contains(normalizedQuery)) {
            return 120;
        }
        return score;
    }

    private static boolean matchesTokenTerms(String haystack, String[] terms) {
        List<String> tokens = tokensOf(haystack);
        if (tokens.isEmpty()) {
            return false;
        }

        for (String term : terms) {
            boolean matched = tokens.stream().anyMatch(token -> token.equals(term) || token.startsWith(term));
            if (!matched) {
                return false;
            }
        }
        return true;
    }

    private static boolean matchesBroadTerms(String haystack, String[] terms) {
        if (haystack == null || haystack.isBlank()) {
            return false;
        }
        String normalizedHaystack = normalize(haystack);
        for (String term : terms) {
            if (!normalizedHaystack.contains(term)) {
                return false;
            }
        }
        return true;
    }

    private static Stream<PvcFinderSuggestion> suggestionStream(PvcOffer offer, PvcFinderFilters filters) {
        return switch (filters.searchScope()) {
            case ITEM -> switch (filters.tradeIntent()) {
                case BOTH -> Stream.concat(
                        offer.sellSuggestionLabels(filters.includeShulker()).stream().map(label -> new PvcFinderSuggestion(label, "Selling")),
                        offer.buySuggestionLabels(filters.includeShulker()).stream().map(label -> new PvcFinderSuggestion(label, "Buying"))
                );
                case SELL -> offer.sellSuggestionLabels(filters.includeShulker()).stream().map(label -> new PvcFinderSuggestion(label, "Selling"));
                case BUY -> offer.buySuggestionLabels(filters.includeShulker()).stream().map(label -> new PvcFinderSuggestion(label, "Buying"));
            };
            case SHOP -> Stream.of(new PvcFinderSuggestion(offer.shop().displayName(), "Shop"));
            case PLAYER -> Stream.of(new PvcFinderSuggestion(offer.shop().displayOwner(), "Player"));
            case VARIANT -> switch (filters.tradeIntent()) {
                case BOTH -> Stream.concat(
                        Stream.of(new PvcFinderSuggestion(offer.resultItem().displayName(), "Variant")),
                        offer.costs().stream().map(cost -> new PvcFinderSuggestion(cost.displayName(), "Trade"))
                );
                case SELL -> Stream.of(new PvcFinderSuggestion(offer.resultItem().displayName(), "Variant"));
                case BUY -> offer.costs().stream().map(cost -> new PvcFinderSuggestion(cost.displayName(), "Trade"));
            };
        };
    }

    private static int suggestionScore(String label, String query) {
        String normalizedLabel = normalize(label);
        String normalizedQuery = normalize(query);
        if (normalizedQuery.isBlank()) {
            return 1;
        }
        if (normalizedLabel.equals(normalizedQuery)) {
            return 300;
        }
        if (normalizedLabel.startsWith(normalizedQuery)) {
            return 220;
        }
        if (matchesTokenTerms(normalizedLabel, tokenize(normalizedQuery))) {
            return 180;
        }
        if (normalizedLabel.contains(normalizedQuery)) {
            return 140;
        }
        return 0;
    }

    private static boolean matchesSuggestionQuery(String label, String query) {
        if (query.isBlank()) {
            return true;
        }
        String normalizedLabel = normalize(label);
        if (normalizedLabel.equals(query) || normalizedLabel.startsWith(query)) {
            return true;
        }
        return matchesTokenTerms(normalizedLabel, tokenize(query));
    }

    private static String normalize(String value) {
        if (value == null) {
            return "";
        }
        return value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
    }

    private static String[] tokenize(String value) {
        String normalized = normalize(value);
        if (normalized.isBlank()) {
            return new String[0];
        }
        return normalized.split("\\s+");
    }

    private static List<String> tokensOf(String value) {
        String[] terms = tokenize(value);
        if (terms.length == 0) {
            return List.of();
        }
        return List.copyOf(new LinkedHashSet<>(List.of(terms)));
    }

    public enum SnapshotSource {
        LIVE("LIVE"),
        CACHE("CACHE"),
        BUNDLED("BUNDLED");

        private final String label;

        SnapshotSource(String label) {
            this.label = label;
        }

        public String label() {
            return label;
        }
    }

    private record LoadResult(PvcSnapshot snapshot, SnapshotSource source) {
    }
}
