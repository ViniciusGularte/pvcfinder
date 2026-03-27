package club.peacefulvanilla.pvcfinder.client;

import club.peacefulvanilla.pvcfinder.PvcFinderMod;
import club.peacefulvanilla.pvcfinder.data.PvcOffer;
import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;
import net.minecraftforge.client.event.AddGuiOverlayLayersEvent;
import net.minecraftforge.client.event.RegisterKeyMappingsEvent;
import net.minecraftforge.client.gui.overlay.ForgeLayeredDraw;
import net.minecraftforge.event.TickEvent;

public final class PvcFinderClient {
    private static final ResourceLocation NUKE_OVERLAY_LAYER =
            ResourceLocation.fromNamespaceAndPath(PvcFinderMod.MOD_ID, "nuke_overlay");
    private static final KeyMapping OPEN_BROWSER_KEY = new KeyMapping(
            "key.pvcfinder.open",
            InputConstants.Type.KEYSYM,
            InputConstants.KEY_N,
            KeyMapping.Category.MISC
    );

    private static final PvcFinderDataStore DATA_STORE = new PvcFinderDataStore();
    private static TrackedShopTarget trackedTarget;
    private static int particleTicker;
    private static boolean bootstrapped;

    private PvcFinderClient() {
    }

    public static void bootstrap() {
        if (bootstrapped) {
            return;
        }
        bootstrapped = true;
        RegisterKeyMappingsEvent.BUS.addListener(PvcFinderClient::registerKeyMappings);
        AddGuiOverlayLayersEvent.BUS.addListener(PvcFinderClient::registerGuiLayers);
        TickEvent.ClientTickEvent.Post.BUS.addListener(PvcFinderClient::onClientTick);
    }

    public static void registerKeyMappings(RegisterKeyMappingsEvent event) {
        event.register(OPEN_BROWSER_KEY);
    }

    public static void registerGuiLayers(AddGuiOverlayLayersEvent event) {
        event.getLayeredDraw().addAbove(
                ForgeLayeredDraw.VANILLA_ROOT,
                NUKE_OVERLAY_LAYER,
                ForgeLayeredDraw.SUBTITLE_OVERLAY,
                (guiGraphics, deltaTracker) -> ClientNukeEffect.renderOverlay(Minecraft.getInstance(), guiGraphics)
        );
    }

    public static void onClientTick(TickEvent.ClientTickEvent.Post event) {
        Minecraft minecraft = Minecraft.getInstance();
        ClientNukeEffect.tick(minecraft);
        if (minecraft.player == null) {
            return;
        }

        while (OPEN_BROWSER_KEY.consumeClick()) {
            DATA_STORE.ensureLoaded(minecraft);
            minecraft.setScreen(new PvcFinderScreen(DATA_STORE));
        }

        tickTrackedTarget(minecraft);
    }

    public static void toggleTracking(Minecraft minecraft, PvcOffer offer) {
        if (isTracked(offer)) {
            clearTracking(minecraft, Component.translatable("message.pvcfinder.tracking_cleared"), false);
            return;
        }

        trackedTarget = TrackedShopTarget.fromOffer(offer);
        particleTicker = 0;
        minecraft.player.displayClientMessage(
                Component.translatable(
                        "message.pvcfinder.tracking_started",
                        offer.shop().displayName(),
                        offer.shop().coordsLabel(),
                        offer.shop().dimensionLabel()
                ),
                true
        );
    }

    public static boolean isTracked(PvcOffer offer) {
        return trackedTarget != null && trackedTarget.offerId().equals(offer.id());
    }

    public static TrackedShopTarget trackedTarget() {
        return trackedTarget;
    }

    public static Component trackingStatus(Minecraft minecraft) {
        if (trackedTarget == null) {
            return Component.translatable("screen.pvcfinder.tracking_none");
        }
        if (minecraft.level == null || minecraft.player == null) {
            return Component.translatable("screen.pvcfinder.tracking_other_dimension", trackedTarget.label());
        }
        if (!minecraft.level.dimension().equals(trackedTarget.dimension())) {
            if (supportsScaledProjection(minecraft.level.dimension(), trackedTarget.dimension())) {
                Vec3 projected = projectTargetIntoDimension(Vec3.atCenterOf(trackedTarget.position()), minecraft.level.dimension(), trackedTarget.dimension());
                double projectedDistance = minecraft.player.position().distanceTo(projected);
                return Component.literal(
                        "Tracking " + trackedTarget.label()
                                + " | shop in " + dimensionName(trackedTarget.dimension())
                                + " | approx " + formatDistance(projectedDistance) + " here"
                );
            }
            return Component.translatable("screen.pvcfinder.tracking_other_dimension", trackedTarget.label());
        }
        return Component.translatable(
                "screen.pvcfinder.tracking_active",
                trackedTarget.label(),
                trackedTarget.position().getX(),
                trackedTarget.position().getY(),
                trackedTarget.position().getZ()
        );
    }

    public static boolean triggerTrackedNuke(Minecraft minecraft) {
        return ClientNukeEffect.trigger(minecraft);
    }

    private static void tickTrackedTarget(Minecraft minecraft) {
        if (trackedTarget == null || minecraft.player == null || minecraft.level == null) {
            return;
        }

        if (!minecraft.level.dimension().equals(trackedTarget.dimension())) {
            return;
        }

        Vec3 targetCenter = Vec3.atCenterOf(trackedTarget.position());
        if (minecraft.player.position().distanceToSqr(targetCenter) <= 25.0D) {
            clearTracking(minecraft, Component.translatable("message.pvcfinder.arrived"), true);
            return;
        }

        if (++particleTicker % 4 != 0) {
            return;
        }

        spawnMarkerParticles(minecraft.level, trackedTarget.position());
    }

    private static void spawnMarkerParticles(ClientLevel level, net.minecraft.core.BlockPos position) {
        double centerX = position.getX() + 0.5D;
        double centerY = position.getY() + 0.35D;
        double centerZ = position.getZ() + 0.5D;

        for (int step = 0; step < 10; step++) {
            level.addAlwaysVisibleParticle(
                    ParticleTypes.END_ROD,
                    centerX,
                    centerY + (step * 0.35D),
                    centerZ,
                    0.0D,
                    0.01D,
                    0.0D
            );
        }

        for (int index = 0; index < 8; index++) {
            double angle = (Math.PI * 2.0D * index) / 8.0D;
            level.addAlwaysVisibleParticle(
                    ParticleTypes.HAPPY_VILLAGER,
                    centerX + Math.cos(angle) * 0.7D,
                    centerY + 0.15D,
                    centerZ + Math.sin(angle) * 0.7D,
                    0.0D,
                    0.02D,
                    0.0D
            );
        }
    }

    private static void clearTracking(Minecraft minecraft, Component message, boolean actionBar) {
        trackedTarget = null;
        particleTicker = 0;
        if (minecraft.player != null) {
            minecraft.player.displayClientMessage(message, actionBar);
        }
    }

    private static boolean supportsScaledProjection(ResourceKey<Level> currentDimension, ResourceKey<Level> targetDimension) {
        return (Level.NETHER.equals(currentDimension) && Level.OVERWORLD.equals(targetDimension))
                || (Level.OVERWORLD.equals(currentDimension) && Level.NETHER.equals(targetDimension));
    }

    private static Vec3 projectTargetIntoDimension(Vec3 target, ResourceKey<Level> currentDimension, ResourceKey<Level> targetDimension) {
        if (Level.NETHER.equals(currentDimension) && Level.OVERWORLD.equals(targetDimension)) {
            return new Vec3(target.x / 8.0D, target.y, target.z / 8.0D);
        }
        if (Level.OVERWORLD.equals(currentDimension) && Level.NETHER.equals(targetDimension)) {
            return new Vec3(target.x * 8.0D, target.y, target.z * 8.0D);
        }
        return target;
    }

    private static String formatDistance(double distance) {
        if (distance >= 1_000_000.0D) {
            return String.format(java.util.Locale.ROOT, "%.1fM blocks", distance / 1_000_000.0D);
        }
        if (distance >= 1_000.0D) {
            return String.format(java.util.Locale.ROOT, "%.1fk blocks", distance / 1_000.0D);
        }
        return Math.round(distance) + " blocks";
    }

    private static String dimensionName(ResourceKey<Level> dimension) {
        if (Level.NETHER.equals(dimension)) {
            return "Nether";
        }
        if (Level.END.equals(dimension)) {
            return "End";
        }
        return "Overworld";
    }
}
