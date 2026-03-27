package club.peacefulvanilla.pvcfinder.data;

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

public record PvcTradeItem(
        String type,
        String customName,
        int amount,
        List<String> lore
) {
    private static final Pattern SHULKER_CONTENT_LINE = Pattern.compile("^-\\s*(\\d+)x\\s+(.+)$", Pattern.CASE_INSENSITIVE);

    public record ShulkerContent(
            int amount,
            String rawName,
            String displayName,
            String searchText
    ) {
    }

    public String displayName() {
        String trimmedCustomName = customName == null ? "" : customName.trim();
        if (isShulkerBox() && (trimmedCustomName.isBlank() || isGenericShulkerName(trimmedCustomName))) {
            ShulkerContent featuredContent = featuredShulkerContent();
            if (featuredContent != null) {
                return "Shulker of " + featuredContent.displayName();
            }
        }

        if (!trimmedCustomName.isBlank()) {
            return trimmedCustomName;
        }
        return prettifyType(type);
    }

    public String shortLabel() {
        return Math.max(amount, 1) + "x " + displayName();
    }

    public String searchText() {
        return (displayName() + " " + type + " " + String.join(" ", lore)).toLowerCase(Locale.ROOT);
    }

    public boolean isShulkerBox() {
        return type != null && type.toLowerCase(Locale.ROOT).contains("shulker_box");
    }

    public boolean hasPreviewContents() {
        return isShulkerBox() && lore != null && lore.stream().anyMatch(line -> line != null && !line.isBlank());
    }

    public List<ShulkerContent> shulkerContents() {
        if (!isShulkerBox() || lore == null) {
            return List.of();
        }

        return lore.stream()
                .map(PvcTradeItem::parseShulkerLine)
                .filter(content -> content != null)
                .collect(Collectors.toList());
    }

    public List<String> previewContents() {
        List<ShulkerContent> contents = shulkerContents();
        if (!contents.isEmpty()) {
            return contents.stream()
                    .map(entry -> entry.amount() + "x " + entry.displayName())
                    .toList();
        }

        if (lore == null) {
            return List.of();
        }
        return lore.stream()
                .map(line -> line == null ? "" : line.trim())
                .filter(line -> !line.isBlank())
                .collect(Collectors.toList());
    }

    public ItemStack toItemStack() {
        ResourceLocation location = itemKey(type);
        Item item = location == null ? Items.PAPER : BuiltInRegistries.ITEM.getValue(location);
        if (item == null || item == Items.AIR) {
            item = Items.PAPER;
        }
        return new ItemStack(item, 1);
    }

    private static ResourceLocation itemKey(String type) {
        if (type == null || type.isBlank()) {
            return null;
        }
        if (type.contains(":")) {
            return ResourceLocation.tryParse(type);
        }
        return ResourceLocation.tryParse("minecraft:" + type.toLowerCase(Locale.ROOT));
    }

    private ShulkerContent featuredShulkerContent() {
        List<ShulkerContent> contents = shulkerContents();
        if (contents.size() == 1) {
            return contents.get(0);
        }
        return null;
    }

    private static ShulkerContent parseShulkerLine(String line) {
        if (line == null) {
            return null;
        }

        String trimmed = line.trim();
        if (trimmed.isBlank()) {
            return null;
        }

        Matcher matcher = SHULKER_CONTENT_LINE.matcher(trimmed);
        if (!matcher.matches()) {
            return null;
        }

        int amount = Integer.parseInt(matcher.group(1));
        String rawName = matcher.group(2).trim();
        String displayName = prettifyShulkerContentName(rawName);
        String searchText = (rawName + " " + displayName).toLowerCase(Locale.ROOT);
        return new ShulkerContent(amount, rawName, displayName, searchText);
    }

    private static boolean isGenericShulkerName(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        return normalized.endsWith("shulker box");
    }

    private static String prettifyShulkerContentName(String rawName) {
        if (rawName == null || rawName.isBlank()) {
            return "Unknown Item";
        }

        String normalized = rawName.trim();
        if (normalized.contains("_")) {
            return prettifyType(normalized);
        }

        String[] parts = normalized.toLowerCase(Locale.ROOT).split("\\s+");
        StringBuilder builder = new StringBuilder();
        for (String part : parts) {
            if (part.isBlank()) {
                continue;
            }
            if (!builder.isEmpty()) {
                builder.append(' ');
            }
            builder.append(Character.toUpperCase(part.charAt(0)));
            if (part.length() > 1) {
                builder.append(part.substring(1));
            }
        }
        return builder.isEmpty() ? normalized : builder.toString();
    }

    private static String prettifyType(String rawType) {
        if (rawType == null || rawType.isBlank()) {
            return "Unknown Item";
        }

        String[] parts = rawType.toLowerCase(Locale.ROOT).split("_");
        StringBuilder builder = new StringBuilder();
        for (String part : parts) {
            if (part.isBlank()) {
                continue;
            }
            if (!builder.isEmpty()) {
                builder.append(' ');
            }
            builder.append(Character.toUpperCase(part.charAt(0)));
            if (part.length() > 1) {
                builder.append(part.substring(1));
            }
        }
        return builder.toString();
    }
}
