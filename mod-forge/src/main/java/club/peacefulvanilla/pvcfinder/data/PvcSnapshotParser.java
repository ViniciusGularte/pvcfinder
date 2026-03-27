package club.peacefulvanilla.pvcfinder.data;

import club.peacefulvanilla.pvcfinder.PvcFinderMod;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.packs.resources.ResourceManager;
import net.minecraft.world.level.Level;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class PvcSnapshotParser {
    private static final ResourceLocation SNAPSHOT_PATH =
            ResourceLocation.fromNamespaceAndPath(PvcFinderMod.MOD_ID, "shops_snapshot.json");

    public PvcSnapshot load(ResourceManager resourceManager) throws IOException {
        try (
                InputStream inputStream = resourceManager.open(SNAPSHOT_PATH);
                Reader reader = new InputStreamReader(inputStream, StandardCharsets.UTF_8)
        ) {
            JsonObject root = JsonParser.parseReader(reader).getAsJsonObject();
            JsonObject information = root.has("information") ? root.getAsJsonObject("information") : new JsonObject();
            String dumpedAt = stringValue(information, "timeDumped", "unknown");

            List<PvcOffer> offers = new ArrayList<>();
            JsonArray shops = root.has("data") ? root.getAsJsonArray("data") : new JsonArray();
            for (int shopIndex = 0; shopIndex < shops.size(); shopIndex++) {
                JsonObject shopObject = shops.get(shopIndex).getAsJsonObject();
                PvcShop shop = parseShop(shopObject);

                JsonArray recipes = shopObject.has("recipes") ? shopObject.getAsJsonArray("recipes") : new JsonArray();
                for (int recipeIndex = 0; recipeIndex < recipes.size(); recipeIndex++) {
                    JsonObject recipeObject = recipes.get(recipeIndex).getAsJsonObject();
                    if (!recipeObject.has("resultItem") || !recipeObject.get("resultItem").isJsonObject()) {
                        continue;
                    }

                    PvcTradeItem resultItem = parseItem(recipeObject.getAsJsonObject("resultItem"));
                    List<PvcTradeItem> costs = new ArrayList<>();
                    addCost(costs, recipeObject, "item1");
                    addCost(costs, recipeObject, "item2");

                    int stock = intValue(recipeObject, "stock", 0);
                    String searchText = buildSearchText(shop, resultItem, costs);
                    offers.add(new PvcOffer(
                            shopIndex + ":" + recipeIndex,
                            shop,
                            resultItem,
                            List.copyOf(costs),
                            stock,
                            searchText
                    ));
                }
            }

            offers.sort((left, right) -> {
                int stockCompare = Integer.compare(right.stock(), left.stock());
                if (stockCompare != 0) {
                    return stockCompare;
                }
                return left.title().compareToIgnoreCase(right.title());
            });

            return new PvcSnapshot(dumpedAt, List.copyOf(offers));
        }
    }

    private static void addCost(List<PvcTradeItem> costs, JsonObject recipeObject, String key) {
        if (!recipeObject.has(key) || !recipeObject.get(key).isJsonObject()) {
            return;
        }
        costs.add(parseItem(recipeObject.getAsJsonObject(key)));
    }

    private static PvcShop parseShop(JsonObject shopObject) {
        String name = stringValue(shopObject, "shopName", "");
        String owner = stringValue(shopObject, "shopOwner", "");
        String worldName = stringValue(shopObject, "world", "World");
        ResourceKey<Level> dimension = mapDimension(worldName);
        BlockPos position = parseLocation(stringValue(shopObject, "location", "0, 64, 0"));
        return new PvcShop(name, owner, worldName, dimension, position);
    }

    private static PvcTradeItem parseItem(JsonObject itemObject) {
        List<String> lore = new ArrayList<>();
        if (itemObject.has("lore") && itemObject.get("lore").isJsonArray()) {
            for (JsonElement line : itemObject.getAsJsonArray("lore")) {
                lore.add(line.getAsString());
            }
        }

        return new PvcTradeItem(
                stringValue(itemObject, "type", "PAPER"),
                stringValue(itemObject, "name", ""),
                intValue(itemObject, "amount", 1),
                List.copyOf(lore)
        );
    }

    private static String buildSearchText(PvcShop shop, PvcTradeItem resultItem, List<PvcTradeItem> costs) {
        StringBuilder builder = new StringBuilder();
        builder.append(resultItem.searchText()).append(' ');
        builder.append(shop.displayName()).append(' ');
        builder.append(shop.displayOwner()).append(' ');
        builder.append(shop.coordsLabel()).append(' ');
        for (PvcTradeItem cost : costs) {
            builder.append(cost.searchText()).append(' ');
        }
        return builder.toString().toLowerCase(Locale.ROOT);
    }

    private static ResourceKey<Level> mapDimension(String worldName) {
        if ("World_nether".equalsIgnoreCase(worldName)) {
            return Level.NETHER;
        }
        if ("World_the_end".equalsIgnoreCase(worldName) || "World_end".equalsIgnoreCase(worldName)) {
            return Level.END;
        }
        return Level.OVERWORLD;
    }

    private static BlockPos parseLocation(String rawLocation) {
        String[] parts = rawLocation.split(",");
        int x = parseCoordinate(parts, 0);
        int y = parseCoordinate(parts, 1);
        int z = parseCoordinate(parts, 2);
        return new BlockPos(x, y, z);
    }

    private static int parseCoordinate(String[] parts, int index) {
        if (index >= parts.length) {
            return 0;
        }
        try {
            return (int) Math.round(Double.parseDouble(parts[index].trim()));
        } catch (NumberFormatException error) {
            return 0;
        }
    }

    private static int intValue(JsonObject object, String key, int fallback) {
        return object.has(key) ? object.get(key).getAsInt() : fallback;
    }

    private static String stringValue(JsonObject object, String key, String fallback) {
        return object.has(key) ? object.get(key).getAsString() : fallback;
    }
}
