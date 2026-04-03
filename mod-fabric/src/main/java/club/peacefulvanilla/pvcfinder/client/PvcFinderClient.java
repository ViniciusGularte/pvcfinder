package club.peacefulvanilla.pvcfinder.client;

import club.peacefulvanilla.pvcfinder.data.PvcOffer;
import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.util.Mth;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

import java.util.List;
import java.util.Locale;

public final class PvcFinderClient {
    private static final int HUD_SURFACE = 0xE60F0B08;
    private static final int HUD_SURFACE_ALT = 0xD91A1209;
    private static final int HUD_BORDER = 0xFF7B4B25;
    private static final int HUD_ACCENT = 0xFFE8760A;
    private static final int HUD_EMERALD = 0xFF4ADE80;
    private static final int HUD_DIAMOND = 0xFF67E8F9;
    private static final int HUD_DANGER = 0xFFE35C5C;
    private static final int HUD_TEXT_BRIGHT = 0xFFF5F0E8;
    private static final int HUD_TEXT = 0xFFD8CCBC;
    private static final int HUD_TEXT_MUTED = 0xFFBCAE9C;

    private static final KeyMapping OPEN_BROWSER_KEY = new KeyMapping(
            "key.pvcfinder.open",
            InputConstants.Type.KEYSYM,
            InputConstants.KEY_N,
            KeyMapping.Category.MISC
    );
    private static final PvcFinderDataStore DATA_STORE = new PvcFinderDataStore();
    private static TrackedShopTarget trackedTarget;
    private static int particleTicker;
    private static int hudIntroTicks;
    private static int hudPulseTicks;
    private static int dimensionReadyTicks;
    private static boolean sameDimensionLastTick;
    private static boolean bootstrapped;

    private PvcFinderClient() {
    }

    public static void bootstrap() {
        if (bootstrapped) {
            return;
        }
        bootstrapped = true;
        KeyBindingHelper.registerKeyBinding(OPEN_BROWSER_KEY);
        ClientTickEvents.END_CLIENT_TICK.register(PvcFinderClient::onClientTick);
        HudRenderCallback.EVENT.register(PvcFinderClient::renderHud);
    }

    public static void onClientTick(Minecraft minecraft) {
        ClientNukeEffect.tick(minecraft);
        ImaginaryFriendController.tick(minecraft);
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
        hudIntroTicks = 0;
        hudPulseTicks = 18;
        dimensionReadyTicks = 0;
        sameDimensionLastTick = minecraft.level != null && minecraft.level.dimension().equals(trackedTarget.dimension());
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

    public static void clearTrackingFromScreen(Minecraft minecraft) {
        if (trackedTarget != null) {
            clearTracking(minecraft, Component.translatable("message.pvcfinder.tracking_cleared"), false);
        }
    }

    public static boolean triggerTrackedNuke(Minecraft minecraft) {
        return ClientNukeEffect.trigger(minecraft);
    }

    public static boolean toggleImaginaryFriend(Minecraft minecraft) {
        return ImaginaryFriendController.toggle(minecraft);
    }

    public static boolean isImaginaryFriendActive() {
        return ImaginaryFriendController.isActive();
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

    public static String offerDistanceLabel(Minecraft minecraft, PvcOffer offer) {
        if (minecraft.player == null || minecraft.level == null) {
            return "distance unavailable";
        }
        if (!minecraft.level.dimension().equals(offer.shop().dimension())) {
            if (supportsScaledProjection(minecraft.level.dimension(), offer.shop().dimension())) {
                Vec3 projected = projectTargetIntoDimension(Vec3.atCenterOf(offer.shop().position()), minecraft.level.dimension(), offer.shop().dimension());
                return "~" + formatDistance(minecraft.player.position().distanceTo(projected)) + " on this axis";
            }
            return offer.shop().dimensionLabel();
        }
        double distance = minecraft.player.position().distanceTo(Vec3.atCenterOf(offer.shop().position()));
        return formatDistance(distance) + " away";
    }

    private static void renderHud(GuiGraphics guiGraphics, DeltaTracker deltaTracker) {
        Minecraft minecraft = Minecraft.getInstance();
        if (!(minecraft.screen instanceof PvcFinderScreen)) {
            ClientNukeEffect.renderOverlay(minecraft, guiGraphics);
        }
        if (trackedTarget == null || minecraft.player == null) {
            return;
        }
        if (minecraft.screen instanceof PvcFinderScreen) {
            return;
        }

        int width = minecraft.getWindow().getGuiScaledWidth();
        int centerX = width / 2;
        boolean sameDimension = minecraft.level != null && minecraft.level.dimension().equals(trackedTarget.dimension());
        boolean projectedDimension = minecraft.level != null && supportsScaledProjection(minecraft.level.dimension(), trackedTarget.dimension());
        float intro = easeOutCubic(Mth.clamp(hudIntroTicks / 10.0F, 0.0F, 1.0F));
        float alphaFactor = 0.45F + (0.55F * intro);
        float pulseFactor = hudPulseTicks > 0 ? (hudPulseTicks / 18.0F) : 0.0F;
        int top = 8 - Math.round((1.0F - intro) * 10.0F);
        String title = trackedTarget.label();
        int accentColor = sameDimension ? HUD_EMERALD : HUD_ACCENT;
        int pulseAccent = blendColor(accentColor, HUD_TEXT_BRIGHT, pulseFactor * 0.35F);

        if (!sameDimension && !projectedDimension) {
            String detail = "Switch to " + dimensionName(trackedTarget.dimension());
            int chipWidth = Math.min(230, Math.max(160, Math.max(minecraft.font.width(title), minecraft.font.width(detail)) + 24));
            int chipLeft = centerX - (chipWidth / 2);
            int chipRight = centerX + (chipWidth / 2);
            guiGraphics.fill(chipLeft, top, chipRight, top + 24, withAlpha(HUD_SURFACE, alphaFactor));
            guiGraphics.fill(chipLeft, top, chipRight, top + 2, withAlpha(pulseAccent, alphaFactor));
            guiGraphics.drawCenteredString(minecraft.font, minecraft.font.plainSubstrByWidth(title, chipWidth - 18), centerX, top + 5, withAlpha(HUD_TEXT_BRIGHT, alphaFactor));
            guiGraphics.drawCenteredString(minecraft.font, minecraft.font.plainSubstrByWidth(detail, chipWidth - 18), centerX, top + 15, withAlpha(HUD_ACCENT, alphaFactor));
            return;
        }

        Vec3 playerPos = minecraft.player.position();
        Vec3 target = sameDimension
                ? Vec3.atCenterOf(trackedTarget.position())
                : projectTargetIntoDimension(Vec3.atCenterOf(trackedTarget.position()), minecraft.level.dimension(), trackedTarget.dimension());
        double distance = playerPos.distanceTo(target);
        double horizontalDistance = horizontalDistance(playerPos, target);
        float nearFade = distance <= 14.0D
                ? Mth.clamp((float) ((distance - 5.0D) / 9.0D), 0.0F, 1.0F)
                : 1.0F;
        alphaFactor *= 0.35F + (0.65F * nearFade);
        float relativeYaw = relativeYawToTarget(minecraft, target);
        String arrow = arrowLabel(relativeYaw);
        String distanceLabel = projectedDimension ? "~" + formatDistance(distance) : formatDistance(distance);
        boolean targetBehind = Math.abs(relativeYaw) > 135.0F;
        int mainWidth = Math.min(248, Math.max(176, Math.max(minecraft.font.width(title) + minecraft.font.width(distanceLabel) + 38, 176)));
        int animatedWidth = Math.max(116, Mth.floor(mainWidth * intro));
        int drawLeft = centerX - (animatedWidth / 2);
        int drawRight = centerX + (animatedWidth / 2);
        int arrowColor = targetBehind ? HUD_DANGER : (Math.abs(relativeYaw) < 10.0F ? HUD_EMERALD : HUD_ACCENT);
        int maxOffset = Math.min((animatedWidth / 2) - 22, 76);
        int markerX = centerX + Math.round(Mth.clamp(relativeYaw / 90.0F, -1.0F, 1.0F) * maxOffset);
        String elevationBadge = elevationBadge(playerPos, target, horizontalDistance);
        String dimensionBadge = projectedDimension ? "SHOP IN " + dimensionName(trackedTarget.dimension()).toUpperCase(Locale.ROOT) : null;

        guiGraphics.fill(drawLeft, top, drawRight, top + 28, withAlpha(HUD_SURFACE, alphaFactor));
        guiGraphics.fill(drawLeft, top, drawRight, top + 2, withAlpha(blendColor(arrowColor, HUD_TEXT_BRIGHT, pulseFactor * 0.35F), alphaFactor));
        if (intro > 0.35F) {
            guiGraphics.drawString(minecraft.font, minecraft.font.plainSubstrByWidth(title, animatedWidth - 86), drawLeft + 8, top + 5, withAlpha(HUD_TEXT_BRIGHT, alphaFactor), false);
            guiGraphics.drawString(minecraft.font, distanceLabel, drawRight - minecraft.font.width(distanceLabel) - 8, top + 5, withAlpha(HUD_TEXT, alphaFactor), false);
            guiGraphics.fill(drawLeft + 20, top + 18, drawRight - 20, top + 19, withAlpha(HUD_BORDER, alphaFactor));
            guiGraphics.drawString(minecraft.font, "L", drawLeft + 12, top + 14, withAlpha(HUD_TEXT_MUTED, alphaFactor), false);
            guiGraphics.drawString(minecraft.font, "R", drawRight - 18, top + 14, withAlpha(HUD_TEXT_MUTED, alphaFactor), false);
            guiGraphics.fill(markerX - 14, top + 14, markerX + 14, top + 26, withAlpha(HUD_SURFACE_ALT, alphaFactor));
            guiGraphics.fill(markerX - 14, top + 14, markerX + 14, top + 16, withAlpha(blendColor(arrowColor, HUD_TEXT_BRIGHT, pulseFactor * 0.35F), alphaFactor));
            guiGraphics.drawCenteredString(minecraft.font, arrow, markerX, top + 18, withAlpha(arrowColor, alphaFactor));
            if (targetBehind) {
                int tagWidth = minecraft.font.width("BEHIND") + 10;
                int tagLeft = drawRight - tagWidth - 8;
                guiGraphics.fill(tagLeft, top + 14, drawRight - 8, top + 25, withAlpha(HUD_SURFACE_ALT, alphaFactor));
                guiGraphics.fill(tagLeft, top + 14, drawRight - 8, top + 16, withAlpha(HUD_DANGER, alphaFactor));
                guiGraphics.drawCenteredString(minecraft.font, "BEHIND", tagLeft + (tagWidth / 2), top + 17, withAlpha(HUD_TEXT_BRIGHT, alphaFactor));
            }
        }

        if (intro > 0.55F) {
            String pulseBadge = dimensionReadyTicks > 0 && !projectedDimension ? "DIM OK" : null;
            renderHudBadges(guiGraphics, minecraft, centerX, top + 31, alphaFactor, pulseBadge, dimensionBadge, elevationBadge);
        }
    }

    private static void tickTrackedTarget(Minecraft minecraft) {
        if (trackedTarget == null || minecraft.player == null || minecraft.level == null) {
            return;
        }

        if (hudIntroTicks < 10) {
            hudIntroTicks++;
        }
        if (hudPulseTicks > 0) {
            hudPulseTicks--;
        }
        if (dimensionReadyTicks > 0) {
            dimensionReadyTicks--;
        }

        boolean sameDimension = minecraft.level.dimension().equals(trackedTarget.dimension());
        if (sameDimension && !sameDimensionLastTick) {
            hudPulseTicks = 18;
            dimensionReadyTicks = 20;
        }
        sameDimensionLastTick = sameDimension;

        if (!sameDimension) {
            return;
        }

        Vec3 targetCenter = Vec3.atCenterOf(trackedTarget.position());
        double distanceSqr = minecraft.player.position().distanceToSqr(targetCenter);
        if (distanceSqr <= 25.0D) {
            clearTracking(minecraft, Component.translatable("message.pvcfinder.arrived"), true);
            return;
        }

        double distance = Math.sqrt(distanceSqr);
        int particleInterval = distance < 12.0D ? 8 : 4;
        if (++particleTicker % particleInterval != 0) {
            return;
        }

        spawnMarkerParticles(minecraft.level, trackedTarget.position(), distance);
    }

    private static void spawnMarkerParticles(ClientLevel level, net.minecraft.core.BlockPos position, double distance) {
        double centerX = position.getX() + 0.5D;
        double centerY = position.getY() + 0.2D;
        double centerZ = position.getZ() + 0.5D;
        int pillarSteps = distance < 10.0D ? 8 : 16;
        int ringParticles = distance < 10.0D ? 8 : 14;
        int crownParticles = distance < 10.0D ? 6 : 10;

        for (int step = 0; step < pillarSteps; step++) {
            level.addAlwaysVisibleParticle(
                    ParticleTypes.END_ROD,
                    centerX,
                    centerY + (step * 0.42D),
                    centerZ,
                    0.0D,
                    0.01D,
                    0.0D
            );
        }

        for (int index = 0; index < ringParticles; index++) {
            double angle = (Math.PI * 2.0D * index) / ringParticles;
            level.addAlwaysVisibleParticle(
                    ParticleTypes.HAPPY_VILLAGER,
                    centerX + Math.cos(angle) * 1.15D,
                    centerY + 0.05D,
                    centerZ + Math.sin(angle) * 1.15D,
                    0.0D,
                    0.02D,
                    0.0D
            );
        }

        for (int index = 0; index < crownParticles; index++) {
            double angle = (Math.PI * 2.0D * index) / crownParticles;
            level.addAlwaysVisibleParticle(
                    ParticleTypes.END_ROD,
                    centerX + Math.cos(angle) * 0.35D,
                    centerY + (pillarSteps * 0.42D),
                    centerZ + Math.sin(angle) * 0.35D,
                    0.0D,
                    0.0D,
                    0.0D
            );
        }
    }

    private static void clearTracking(Minecraft minecraft, Component message, boolean actionBar) {
        trackedTarget = null;
        particleTicker = 0;
        hudIntroTicks = 0;
        hudPulseTicks = 0;
        dimensionReadyTicks = 0;
        sameDimensionLastTick = false;
        if (minecraft.player != null) {
            minecraft.player.displayClientMessage(message, actionBar);
        }
    }

    private static int withAlpha(int color, float factor) {
        int alpha = (color >>> 24) & 0xFF;
        int red = (color >>> 16) & 0xFF;
        int green = (color >>> 8) & 0xFF;
        int blue = color & 0xFF;
        int scaledAlpha = Mth.clamp(Math.round(alpha * factor), 0, 255);
        return (scaledAlpha << 24) | (red << 16) | (green << 8) | blue;
    }

    private static int blendColor(int from, int to, float amount) {
        float clamped = Mth.clamp(amount, 0.0F, 1.0F);
        int fromA = (from >>> 24) & 0xFF;
        int fromR = (from >>> 16) & 0xFF;
        int fromG = (from >>> 8) & 0xFF;
        int fromB = from & 0xFF;
        int toA = (to >>> 24) & 0xFF;
        int toR = (to >>> 16) & 0xFF;
        int toG = (to >>> 8) & 0xFF;
        int toB = to & 0xFF;
        int outA = Mth.floor(Mth.lerp(clamped, fromA, toA));
        int outR = Mth.floor(Mth.lerp(clamped, fromR, toR));
        int outG = Mth.floor(Mth.lerp(clamped, fromG, toG));
        int outB = Mth.floor(Mth.lerp(clamped, fromB, toB));
        return (outA << 24) | (outR << 16) | (outG << 8) | outB;
    }

    private static void renderHudBadges(GuiGraphics guiGraphics, Minecraft minecraft, int centerX, int top, float alphaFactor, String firstBadge, String secondBadge, String thirdBadge) {
        List<String> badges = java.util.stream.Stream.of(firstBadge, secondBadge, thirdBadge)
                .filter(label -> label != null && !label.isBlank())
                .toList();
        if (badges.isEmpty()) {
            return;
        }

        int totalWidth = 0;
        for (String badge : badges) {
            totalWidth += minecraft.font.width(badge) + 12;
        }
        totalWidth += (badges.size() - 1) * 6;
        int x = centerX - (totalWidth / 2);
        float badgeAlpha = Math.min(alphaFactor, 0.78F);
        for (String badge : badges) {
            int badgeWidth = minecraft.font.width(badge) + 12;
            int accent = badge.startsWith("SHOP IN") ? HUD_ACCENT : (badge.startsWith("DIM") ? HUD_EMERALD : HUD_DIAMOND);
            guiGraphics.fill(x, top, x + badgeWidth, top + 12, withAlpha(HUD_SURFACE_ALT, badgeAlpha));
            guiGraphics.fill(x, top, x + badgeWidth, top + 2, withAlpha(accent, badgeAlpha));
            guiGraphics.drawCenteredString(minecraft.font, badge, x + (badgeWidth / 2), top + 3, withAlpha(HUD_TEXT_BRIGHT, badgeAlpha));
            x += badgeWidth + 6;
        }
    }

    private static float easeOutCubic(float value) {
        float inverted = 1.0F - value;
        return 1.0F - (inverted * inverted * inverted);
    }

    private static float relativeYawToTarget(Minecraft minecraft, Vec3 target) {
        if (minecraft.player == null) {
            return 0.0F;
        }
        double dx = target.x - minecraft.player.getX();
        double dz = target.z - minecraft.player.getZ();
        float targetYaw = (float) Math.toDegrees(Math.atan2(dz, dx)) - 90.0F;
        return Mth.wrapDegrees(targetYaw - minecraft.player.getYRot());
    }

    private static String arrowLabel(float relativeYaw) {
        float absolute = Math.abs(relativeYaw);
        if (absolute < 10.0F) {
            return "^";
        }
        if (absolute < 40.0F) {
            return relativeYaw < 0.0F ? "<^" : "^>";
        }
        if (absolute < 120.0F) {
            return relativeYaw < 0.0F ? "<<" : ">>";
        }
        return relativeYaw < 0.0F ? "v<" : ">v";
    }

    private static String formatDistance(double distance) {
        if (distance >= 1_000_000.0D) {
            return String.format(Locale.ROOT, "%.1fM blocks", distance / 1_000_000.0D);
        }
        if (distance >= 1_000.0D) {
            return String.format(Locale.ROOT, "%.1fk blocks", distance / 1_000.0D);
        }
        return Math.round(distance) + " blocks";
    }

    private static String elevationBadge(Vec3 playerPos, Vec3 targetPos, double horizontalDistance) {
        if (horizontalDistance > 48.0D) {
            return null;
        }
        double deltaY = targetPos.y - playerPos.y;
        if (deltaY >= 4.0D) {
            return "ABOVE " + Math.round(deltaY);
        }
        if (deltaY <= -4.0D) {
            return "BELOW " + Math.round(Math.abs(deltaY));
        }
        return horizontalDistance <= 18.0D ? "LEVEL" : null;
    }

    private static double horizontalDistance(Vec3 from, Vec3 to) {
        double dx = to.x - from.x;
        double dz = to.z - from.z;
        return Math.sqrt((dx * dx) + (dz * dz));
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
