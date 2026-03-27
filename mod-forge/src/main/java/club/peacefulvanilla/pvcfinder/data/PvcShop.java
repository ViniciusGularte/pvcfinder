package club.peacefulvanilla.pvcfinder.data;

import net.minecraft.core.BlockPos;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.Level;

public record PvcShop(
        String name,
        String owner,
        String worldName,
        ResourceKey<Level> dimension,
        BlockPos position
) {
    public String displayName() {
        return name == null || name.isBlank() ? "Unnamed Shop" : name;
    }

    public String displayOwner() {
        return owner == null || owner.isBlank() ? "Unknown Owner" : owner;
    }

    public String coordsLabel() {
        return position.getX() + ", " + position.getY() + ", " + position.getZ();
    }

    public String dimensionLabel() {
        if (Level.NETHER.equals(dimension)) {
            return "Nether";
        }
        if (Level.END.equals(dimension)) {
            return "End";
        }
        return "Overworld";
    }
}
