package club.peacefulvanilla.pvcfinder.client;

import club.peacefulvanilla.pvcfinder.data.PvcOffer;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.Level;

public record TrackedShopTarget(
        String offerId,
        String label,
        ResourceKey<Level> dimension,
        BlockPos position
) {
    public static TrackedShopTarget fromOffer(PvcOffer offer) {
        return new TrackedShopTarget(
                offer.id(),
                offer.title() + " @ " + offer.shop().displayName(),
                offer.shop().dimension(),
                offer.shop().position()
        );
    }
}
