package club.peacefulvanilla.pvcfinder.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.Mth;

import java.util.Random;

public final class ClientNukeEffect {
    private static final Random RANDOM = new Random();
    private static final ResourceLocation NUCLEAR_ALARM_ID =
            ResourceLocation.fromNamespaceAndPath("pvcfinder", "nuclear_alarm");
    private static final SoundEvent NUCLEAR_ALARM_EVENT =
            SoundEvent.createVariableRangeEvent(NUCLEAR_ALARM_ID);
    private static final int COUNTDOWN_TICKS = 600;
    private static final int DETONATION_TICKS = 360;
    private static final int HEAVY_SHAKE_TICKS = 220;
    private static final int RUMBLE_TICKS = 320;
    private static final int COLOR_WARNING = 0xFFFFE7C2;
    private static final int COLOR_ALERT = 0xFFFF6B3D;
    private static final int COLOR_WHITEOUT = 0xFFFFF8E8;
    private static final int COLOR_HEAT = 0xFFFFA23C;
    private static final int COLOR_SOOT = 0xFF140804;
    private static final int COLOR_GHOST = 0xFFF2F2F2;
    private static final int COLOR_GHOST_DARK = 0xFF050505;

    private static int countdownTicks;
    private static int detonationTicks;
    private static int heavyShakeTicks;
    private static int rumbleTicks;
    private static int hauntShakeTicks;
    private static int hauntBlinkTicks;
    private static int hauntFlashTicks;
    private static int nextBlinkTicks;
    private static int nextSoundTicks;
    private static int nextShakeTicks;
    private static int hauntLifetimeTicks;
    private static boolean hauntingActive;
    private static boolean detonationPlayed;
    private static boolean alarmPlayed;
    private static boolean releaseMessageShown;
    private static float lastYawOffset;
    private static float lastPitchOffset;

    private ClientNukeEffect() {
    }

    public static boolean trigger(Minecraft minecraft) {
        if (minecraft == null || minecraft.player == null) {
            return false;
        }

        clearState(minecraft);
        countdownTicks = COUNTDOWN_TICKS;
        minecraft.setScreen(null);
        minecraft.player.displayClientMessage(Component.translatable("message.pvcfinder.nuke_client"), true);
        return true;
    }

    public static void tick(Minecraft minecraft) {
        if (minecraft == null || minecraft.player == null || minecraft.level == null) {
            clearState(minecraft);
            return;
        }

        if (countdownTicks > 0) {
            if (!alarmPlayed) {
                minecraft.getSoundManager().play(SimpleSoundInstance.forUI(NUCLEAR_ALARM_EVENT, 1.0F, 1.0F));
                alarmPlayed = true;
            }
            countdownTicks--;
            if (countdownTicks == 0) {
                detonationTicks = DETONATION_TICKS;
                heavyShakeTicks = HEAVY_SHAKE_TICKS;
                rumbleTicks = RUMBLE_TICKS;
                hauntingActive = true;
                hauntLifetimeTicks = 0;
                scheduleHauntEvents();
            }
        } else if (detonationTicks > 0) {
            detonationTicks--;
            if (!detonationPlayed) {
                minecraft.getSoundManager().play(SimpleSoundInstance.forUI(SoundEvents.WARDEN_SONIC_BOOM, 2.0F, 0.48F));
                minecraft.getSoundManager().play(SimpleSoundInstance.forUI(SoundEvents.LIGHTNING_BOLT_THUNDER, 3.2F, 0.45F));
                minecraft.getSoundManager().play(SimpleSoundInstance.forUI(SoundEvents.DRAGON_FIREBALL_EXPLODE, 2.8F, 0.42F));
                detonationPlayed = true;
            }
            if (detonationTicks == 0 && !releaseMessageShown) {
                minecraft.player.displayClientMessage(Component.translatable("message.pvcfinder.nuke_released"), true);
                releaseMessageShown = true;
            }
        }

        if (hauntingActive) {
            tickHaunting(minecraft);
        }

        tickCamera(minecraft);
    }

    public static void renderOverlay(Minecraft minecraft, GuiGraphics guiGraphics) {
        if (minecraft == null || guiGraphics == null) {
            return;
        }

        int width = minecraft.getWindow().getGuiScaledWidth();
        int height = minecraft.getWindow().getGuiScaledHeight();
        if (countdownTicks > 0) {
            renderCountdown(guiGraphics, minecraft, width, height);
        }
        if (detonationTicks > 0) {
            renderDetonation(guiGraphics, width, height);
        }
        if (hauntingActive) {
            renderHauntingOverlay(guiGraphics, width, height);
        }
    }

    private static void tickHaunting(Minecraft minecraft) {
        hauntLifetimeTicks++;

        if (hauntBlinkTicks > 0) {
            hauntBlinkTicks--;
        }
        if (hauntFlashTicks > 0) {
            hauntFlashTicks--;
        }
        if (hauntShakeTicks > 0) {
            hauntShakeTicks--;
        }

        if (--nextBlinkTicks <= 0) {
            hauntBlinkTicks = 4 + RANDOM.nextInt(4);
            hauntFlashTicks = Math.max(hauntFlashTicks, 2 + RANDOM.nextInt(3));
            nextBlinkTicks = randomRange(120, 280);
        }

        if (--nextShakeTicks <= 0) {
            hauntShakeTicks = randomRange(18, 46);
            rumbleTicks = Math.max(rumbleTicks, randomRange(22, 48));
            nextShakeTicks = randomRange(100, 240);
        }

        if (--nextSoundTicks <= 0) {
            playHauntSound(minecraft);
            nextSoundTicks = randomRange(140, 320);
        }
    }

    private static void renderCountdown(GuiGraphics guiGraphics, Minecraft minecraft, int width, int height) {
        float progress = 1.0F - (countdownTicks / (float) COUNTDOWN_TICKS);
        float pulse = 0.04F + ((float) Math.sin((COUNTDOWN_TICKS - countdownTicks) * 0.18F) * 0.02F);
        float urgent = countdownTicks <= 100 ? (1.0F - (countdownTicks / 100.0F)) : 0.0F;
        int seconds = Mth.ceil(countdownTicks / 20.0F);
        String timerText = String.format("%02d", seconds);

        guiGraphics.fill(0, 0, width, 30, withAlpha(COLOR_SOOT, 0.8F));
        guiGraphics.fill(0, 30, width, 32, withAlpha(COLOR_ALERT, 0.6F + (urgent * 0.3F)));
        guiGraphics.fill(0, 0, width, height, withAlpha(COLOR_ALERT, pulse + (urgent * 0.05F)));
        guiGraphics.drawString(font(minecraft), "LOOK FOR REFUGE", 12, 10, withAlpha(COLOR_WARNING, 0.9F + (urgent * 0.1F)), false);
        guiGraphics.drawString(font(minecraft), timerText, width - font(minecraft).width(timerText) - 14, 10, withAlpha(COLOR_WHITEOUT, 0.98F), false);

        int barLeft = 12;
        int barRight = width - 12;
        int barTop = 36;
        int filled = barLeft + Math.round((barRight - barLeft) * progress);
        guiGraphics.fill(barLeft, barTop, barRight, barTop + 5, withAlpha(0xFF2A1109, 0.82F));
        guiGraphics.fill(barLeft, barTop, filled, barTop + 5, withAlpha(COLOR_ALERT, 0.96F));
    }

    private static void renderDetonation(GuiGraphics guiGraphics, int width, int height) {
        int elapsed = DETONATION_TICKS - detonationTicks;
        float progress = detonationTicks / (float) DETONATION_TICKS;
        float whiteout = elapsed < 44
                ? 1.0F
                : Mth.clamp((progress * progress * 2.2F) + 0.3F, 0.0F, 1.0F);
        float heat = Mth.clamp((progress * 1.1F) + 0.22F, 0.0F, 1.0F);
        float soot = Mth.clamp((1.0F - progress) * 0.74F, 0.0F, 0.74F);
        float bloom = elapsed < 86 ? (1.0F - (elapsed / 86.0F)) : 0.0F;

        guiGraphics.fill(0, 0, width, height, withAlpha(COLOR_WHITEOUT, whiteout));
        guiGraphics.fill(0, 0, width, height, withAlpha(COLOR_HEAT, heat * 0.62F));
        guiGraphics.fill(0, 0, width, height / 2, withAlpha(COLOR_ALERT, bloom * 0.5F));
        guiGraphics.fill(0, 0, width, height, withAlpha(COLOR_ALERT, bloom * 0.18F));
        guiGraphics.fill(0, (height * 2) / 3, width, height, withAlpha(COLOR_SOOT, soot));
        guiGraphics.fill(0, 0, width, height, withAlpha(COLOR_SOOT, soot * 0.5F));
    }

    private static void renderHauntingOverlay(GuiGraphics guiGraphics, int width, int height) {
        float pulse = 0.08F + (((float) Math.sin(hauntLifetimeTicks * 0.08F) + 1.0F) * 0.03F);
        guiGraphics.fill(0, 0, width, height, withAlpha(COLOR_SOOT, pulse));

        int vignetteAlpha = withAlpha(COLOR_SOOT, 0.22F);
        guiGraphics.fill(0, 0, width, 18, vignetteAlpha);
        guiGraphics.fill(0, height - 18, width, height, vignetteAlpha);
        guiGraphics.fill(0, 0, 12, height, vignetteAlpha);
        guiGraphics.fill(width - 12, 0, width, height, vignetteAlpha);

        if (hauntFlashTicks > 0) {
            float flash = 0.18F + (hauntFlashTicks / 5.0F) * 0.38F;
            guiGraphics.fill(0, 0, width, height, withAlpha(COLOR_WHITEOUT, flash));
        }

        if (hauntBlinkTicks > 0) {
            renderHerobrineBlink(guiGraphics, width, height);
        }
    }

    private static void renderHerobrineBlink(GuiGraphics guiGraphics, int width, int height) {
        float alpha = Mth.clamp(hauntBlinkTicks / 6.0F, 0.0F, 1.0F);
        int centerX = width / 2;
        int centerY = height / 2;
        int jitterX = Mth.floor(((float) Math.sin(hauntLifetimeTicks * 0.9F) * 5.0F) + (RANDOM.nextFloat() - 0.5F) * 4.0F);
        int jitterY = Mth.floor(((float) Math.cos(hauntLifetimeTicks * 0.7F) * 4.0F));
        int headSize = Math.max(42, Math.min(width, height) / 4);
        int bodyWidth = Math.max(34, headSize / 2);
        int bodyHeight = Math.max(74, headSize + 18);
        int headLeft = centerX - (headSize / 2) + jitterX;
        int headTop = centerY - headSize + jitterY;
        int headRight = headLeft + headSize;
        int headBottom = headTop + headSize;
        int bodyLeft = centerX - (bodyWidth / 2) + jitterX;
        int bodyTop = headBottom - 4;
        int bodyRight = bodyLeft + bodyWidth;
        int bodyBottom = bodyTop + bodyHeight;
        int eyeWidth = Math.max(10, headSize / 5);
        int eyeHeight = Math.max(7, headSize / 7);
        int eyeY = headTop + Math.max(12, headSize / 3);
        int leftEyeX = headLeft + Math.max(10, headSize / 5);
        int rightEyeX = headRight - Math.max(10, headSize / 5) - eyeWidth;

        guiGraphics.fill(0, 0, width, height, withAlpha(COLOR_SOOT, 0.26F * alpha));
        guiGraphics.fill(headLeft - 8, headTop - 8, headRight + 8, bodyBottom + 10, withAlpha(COLOR_GHOST_DARK, 0.35F * alpha));
        guiGraphics.fill(headLeft, headTop, headRight, headBottom, withAlpha(0xFF141414, 0.96F * alpha));
        guiGraphics.fill(bodyLeft, bodyTop, bodyRight, bodyBottom, withAlpha(0xFF0D0D0D, 0.9F * alpha));
        guiGraphics.fill(bodyLeft - 20, bodyTop + 10, bodyLeft - 6, bodyTop + 54, withAlpha(0xFF0D0D0D, 0.8F * alpha));
        guiGraphics.fill(bodyRight + 6, bodyTop + 10, bodyRight + 20, bodyTop + 54, withAlpha(0xFF0D0D0D, 0.8F * alpha));
        guiGraphics.fill(leftEyeX, eyeY, leftEyeX + eyeWidth, eyeY + eyeHeight, withAlpha(COLOR_GHOST, alpha));
        guiGraphics.fill(rightEyeX, eyeY, rightEyeX + eyeWidth, eyeY + eyeHeight, withAlpha(COLOR_GHOST, alpha));
        guiGraphics.fill(leftEyeX - 3, eyeY - 3, leftEyeX + eyeWidth + 3, eyeY + eyeHeight + 3, withAlpha(COLOR_WHITEOUT, 0.14F * alpha));
        guiGraphics.fill(rightEyeX - 3, eyeY - 3, rightEyeX + eyeWidth + 3, eyeY + eyeHeight + 3, withAlpha(COLOR_WHITEOUT, 0.14F * alpha));
    }

    private static void tickCamera(Minecraft minecraft) {
        restoreCamera(minecraft);
        if (minecraft.player == null) {
            return;
        }

        int activeTicks = Math.max(heavyShakeTicks, Math.max(hauntShakeTicks, rumbleTicks));
        if (activeTicks <= 0) {
            return;
        }

        float maxTicks;
        float amplitude;
        if (heavyShakeTicks > 0) {
            maxTicks = HEAVY_SHAKE_TICKS;
            float progress = heavyShakeTicks / maxTicks;
            amplitude = 28.0F * progress * progress;
            heavyShakeTicks--;
        } else if (hauntShakeTicks > 0) {
            maxTicks = 46.0F;
            float progress = hauntShakeTicks / maxTicks;
            amplitude = 12.0F * (0.55F + progress);
            hauntShakeTicks--;
        } else {
            maxTicks = RUMBLE_TICKS;
            float progress = rumbleTicks / maxTicks;
            amplitude = 8.5F * Math.max(progress, 0.32F);
            rumbleTicks--;
        }

        lastYawOffset = (RANDOM.nextFloat() - 0.5F) * amplitude;
        lastPitchOffset = (RANDOM.nextFloat() - 0.5F) * amplitude * 0.82F;
        minecraft.player.setYRot(minecraft.player.getYRot() + lastYawOffset);
        minecraft.player.setXRot(Mth.clamp(minecraft.player.getXRot() + lastPitchOffset, -90.0F, 90.0F));
    }

    private static void playHauntSound(Minecraft minecraft) {
        float volume = 0.7F + (RANDOM.nextFloat() * 0.7F);
        float pitch = 0.55F + (RANDOM.nextFloat() * 0.45F);
        SoundEvent sound = switch (RANDOM.nextInt(4)) {
            case 0 -> SoundEvents.ENDERMAN_STARE;
            case 1 -> SoundEvents.PORTAL_AMBIENT;
            case 2 -> SoundEvents.BEACON_AMBIENT;
            default -> SoundEvents.RESPAWN_ANCHOR_SET_SPAWN;
        };
        minecraft.getSoundManager().play(SimpleSoundInstance.forUI(sound, volume, pitch));
    }

    private static void scheduleHauntEvents() {
        nextBlinkTicks = randomRange(7_200, 9_600);
        nextSoundTicks = randomRange(6_600, 10_200);
        nextShakeTicks = randomRange(6_800, 9_800);
        hauntBlinkTicks = 0;
        hauntFlashTicks = 0;
        hauntShakeTicks = 0;
    }

    private static int randomRange(int minInclusive, int maxInclusive) {
        return minInclusive + RANDOM.nextInt((maxInclusive - minInclusive) + 1);
    }

    private static void restoreCamera(Minecraft minecraft) {
        if (minecraft == null || minecraft.player == null) {
            lastYawOffset = 0.0F;
            lastPitchOffset = 0.0F;
            return;
        }
        if (lastYawOffset == 0.0F && lastPitchOffset == 0.0F) {
            return;
        }

        minecraft.player.setYRot(minecraft.player.getYRot() - lastYawOffset);
        minecraft.player.setXRot(Mth.clamp(minecraft.player.getXRot() - lastPitchOffset, -90.0F, 90.0F));
        lastYawOffset = 0.0F;
        lastPitchOffset = 0.0F;
    }

    private static void clearState(Minecraft minecraft) {
        restoreCamera(minecraft);
        countdownTicks = 0;
        detonationTicks = 0;
        heavyShakeTicks = 0;
        rumbleTicks = 0;
        hauntShakeTicks = 0;
        hauntBlinkTicks = 0;
        hauntFlashTicks = 0;
        nextBlinkTicks = 0;
        nextSoundTicks = 0;
        nextShakeTicks = 0;
        hauntLifetimeTicks = 0;
        hauntingActive = false;
        detonationPlayed = false;
        alarmPlayed = false;
        releaseMessageShown = false;
    }

    private static net.minecraft.client.gui.Font font(Minecraft minecraft) {
        return minecraft.font;
    }

    private static int withAlpha(int color, float factor) {
        int alpha = (color >>> 24) & 0xFF;
        int red = (color >>> 16) & 0xFF;
        int green = (color >>> 8) & 0xFF;
        int blue = color & 0xFF;
        int scaledAlpha = Mth.clamp(Math.round(alpha * factor), 0, 255);
        return (scaledAlpha << 24) | (red << 16) | (green << 8) | blue;
    }
}
