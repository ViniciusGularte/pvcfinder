package club.peacefulvanilla.pvcfinder.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.Pose;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.alchemy.PotionContents;
import net.minecraft.world.item.alchemy.Potions;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.Vec3;

public final class ImaginaryFriendController {
    private static final int FRIEND_ENTITY_ID = -904201;
    private static final double FOLLOW_DISTANCE = 1.8D;
    private static final double SIDE_OFFSET = 1.05D;
    private static final double IDLE_RADIUS = 1.7D;
    private static final double IDLE_SWAY_SPEED = 0.04D;
    private static final double IDLE_BOB = 0.22D;
    private static final double TELEPORT_DISTANCE_SQR = 18.0D * 18.0D;
    private static final double MAX_HEIGHT_DELTA = 5.5D;
    private static final int ITEM_ROTATION_TICKS = 20 * 60 * 3;
    private static final int SPECIAL_MIN_COOLDOWN = 70;
    private static final int EAT_SOUND_INTERVAL = 7;

    private static ImaginaryFriendPlayer friend;
    private static boolean enabled;
    private static double idleAngle;
    private static int itemRotationTicks;
    private static int heldItemIndex;
    private static int behaviorTicksRemaining;
    private static int behaviorCooldownTicks;
    private static FriendBehavior behavior = FriendBehavior.FOLLOW;
    private static Vec3 behaviorAnchor;
    private static float observeYaw;

    private ImaginaryFriendController() {
    }

    public static boolean isActive() {
        return enabled;
    }

    public static boolean toggle(Minecraft minecraft) {
        if (enabled) {
            disable(minecraft, true);
            return false;
        }
        return enable(minecraft, true);
    }

    public static void tick(Minecraft minecraft) {
        if (!enabled) {
            return;
        }
        if (minecraft.level == null || minecraft.player == null) {
            removeFriendEntity();
            return;
        }

        ClientLevel level = minecraft.level;
        LocalPlayer player = minecraft.player;
        if (friend == null || friend.isRemoved() || friend.level() != level) {
            if (!spawnFriend(level, player)) {
                return;
            }
        }

        tickHeldItem(level);
        tickBehaviorSelection(level, player);
        applyBehavior(level, player);
    }

    private static boolean enable(Minecraft minecraft, boolean announce) {
        if (minecraft.level == null || minecraft.player == null) {
            return false;
        }
        enabled = true;
        if (!spawnFriend(minecraft.level, minecraft.player)) {
            enabled = false;
            return false;
        }
        if (announce) {
            minecraft.player.displayClientMessage(Component.translatable("message.pvcfinder.jesus_spawned"), true);
        }
        return true;
    }

    private static void disable(Minecraft minecraft, boolean announce) {
        enabled = false;
        itemRotationTicks = 0;
        behaviorTicksRemaining = 0;
        behaviorCooldownTicks = 0;
        behavior = FriendBehavior.FOLLOW;
        behaviorAnchor = null;
        removeFriendEntity();
        if (announce && minecraft.player != null) {
            minecraft.player.displayClientMessage(Component.translatable("message.pvcfinder.jesus_despawned"), true);
        }
    }

    private static boolean spawnFriend(ClientLevel level, LocalPlayer player) {
        removeFriendEntity();
        idleAngle = Math.toRadians(player.getYRot() - 35.0F);
        itemRotationTicks = ITEM_ROTATION_TICKS;
        behaviorTicksRemaining = 0;
        behaviorCooldownTicks = 60;
        behavior = FriendBehavior.FOLLOW;
        heldItemIndex = 0;
        behaviorAnchor = null;
        friend = new ImaginaryFriendPlayer(level);
        friend.setId(FRIEND_ENTITY_ID);
        friend.setUUID(ImaginaryFriendPlayer.PROFILE_ID);
        equipHeldItem();
        teleportFriend(followTarget(level, player), player);
        level.addEntity(friend);
        if (!level.players().contains(friend)) {
            level.players().add(friend);
        }
        return true;
    }

    private static void removeFriendEntity() {
        if (friend == null) {
            return;
        }
        if (friend.level() instanceof ClientLevel level) {
            level.players().remove(friend);
            if (level.getEntity(friend.getId()) != null) {
                level.removeEntity(friend.getId(), Entity.RemovalReason.DISCARDED);
            }
        }
        friend = null;
    }

    private static void tickHeldItem(ClientLevel level) {
        if (friend == null) {
            return;
        }
        if (behavior == FriendBehavior.EAT || behavior == FriendBehavior.DRINK) {
            return;
        }
        if (--itemRotationTicks > 0) {
            equipHeldItem();
            return;
        }

        heldItemIndex = (heldItemIndex + 1) % 4;
        itemRotationTicks = ITEM_ROTATION_TICKS;
        equipHeldItem();
        if (heldItemIndex == 1) {
            level.playLocalSound(friend, SoundEvents.TOTEM_USE, SoundSource.PLAYERS, 0.18F, 1.45F);
            spawnSubtleHalo(level);
        } else if (heldItemIndex == 2) {
            level.playLocalSound(friend, SoundEvents.FISHING_BOBBER_SPLASH, SoundSource.PLAYERS, 0.12F, 1.15F);
        }
    }

    private static void equipHeldItem() {
        if (friend == null) {
            return;
        }
        friend.stopUsingItem();
        friend.setItemInHand(InteractionHand.MAIN_HAND, switch (heldItemIndex) {
            case 1 -> new ItemStack(Items.TOTEM_OF_UNDYING);
            case 2 -> new ItemStack(Items.SALMON);
            case 3 -> PotionContents.createItemStack(Items.POTION, Potions.REGENERATION);
            default -> new ItemStack(Items.BREAD);
        });
    }

    private static void tickBehaviorSelection(ClientLevel level, LocalPlayer player) {
        if (friend == null) {
            return;
        }
        if (behaviorCooldownTicks > 0) {
            behaviorCooldownTicks--;
        }

        if (behavior != FriendBehavior.FOLLOW) {
            if (friend.position().distanceToSqr(player.position()) > 9.0D * 9.0D) {
                endBehavior();
                return;
            }
            if (--behaviorTicksRemaining <= 0) {
                endBehavior();
            }
            return;
        }

        if (behaviorCooldownTicks > 0) {
            return;
        }

        int roll = level.random.nextInt(420);
        if (roll < 3) {
            startBehavior(FriendBehavior.OBSERVE, 38 + level.random.nextInt(42), friend.position());
            observeYaw = friend.getYHeadRot() + (level.random.nextBoolean() ? 55.0F : -55.0F);
            return;
        }
        if (roll < 5) {
            startBehavior(FriendBehavior.PRAY, 44 + level.random.nextInt(48), friend.position());
            level.playLocalSound(friend, SoundEvents.ILLUSIONER_CAST_SPELL, SoundSource.PLAYERS, 0.08F, 1.75F);
            spawnSubtleHalo(level);
            return;
        }
        if (roll < 7) {
            startBehavior(FriendBehavior.CROUCH, 28 + level.random.nextInt(30), friend.position());
            return;
        }
        if (roll < 9) {
            startBehavior(FriendBehavior.SIT, 34 + level.random.nextInt(36), friend.position());
            return;
        }
        if (roll < 13) {
            startBehavior(FriendBehavior.EAT, 24 + level.random.nextInt(10), friend.position());
            friend.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.BREAD));
            friend.startUsingItem(InteractionHand.MAIN_HAND);
            return;
        }
        if (roll < 16) {
            startBehavior(FriendBehavior.DRINK, 28 + level.random.nextInt(8), friend.position());
            friend.setItemInHand(InteractionHand.MAIN_HAND, PotionContents.createItemStack(Items.POTION, Potions.REGENERATION));
            friend.startUsingItem(InteractionHand.MAIN_HAND);
            level.playLocalSound(friend, SoundEvents.WITCH_DRINK, SoundSource.PLAYERS, 0.15F, 1.15F);
            return;
        }
        if (roll < 22) {
            Vec3 wanderTarget = friend.position().add(
                    (level.random.nextDouble() - 0.5D) * 2.8D,
                    0.0D,
                    (level.random.nextDouble() - 0.5D) * 2.8D
            );
            startBehavior(FriendBehavior.WANDER, 42 + level.random.nextInt(34), snapToGround(level, player.position(), wanderTarget));
        }
    }

    private static void applyBehavior(ClientLevel level, LocalPlayer player) {
        Vec3 desired = switch (behavior) {
            case FOLLOW -> followTarget(level, player);
            case WANDER -> behaviorAnchor == null ? followTarget(level, player) : behaviorAnchor;
            default -> behaviorAnchor == null ? friend.position() : behaviorAnchor;
        };

        if (friend.position().distanceToSqr(player.position()) > TELEPORT_DISTANCE_SQR || friend.getY() < level.getMinY() - 8.0D) {
            endBehavior();
            teleportFriend(followTarget(level, player), player);
            return;
        }

        if (behavior == FriendBehavior.FOLLOW || behavior == FriendBehavior.WANDER) {
            stepFriend(player, desired);
            return;
        }

        holdPose(level, player, desired);
    }

    private static void stepFriend(LocalPlayer player, Vec3 target) {
        if (friend == null) {
            return;
        }

        clearPoseOverrides();
        equipHeldItem();

        Vec3 offset = target.subtract(friend.position());
        double horizontalDistance = Math.hypot(offset.x, offset.z);
        float moveYaw = lookYaw(friend.position(), target);
        float lookYaw = lookYaw(friend.position(), player.position());
        float bodyYaw = Mth.approachDegrees(friend.getYRot(), moveYaw, horizontalDistance > 1.25D ? 14.0F : 8.0F);

        friend.setXRot(0.0F);
        friend.setYRot(bodyYaw);
        friend.setYBodyRot(bodyYaw);
        friend.setYHeadRot(Mth.approachDegrees(friend.getYHeadRot(), lookYaw, 18.0F));
        friend.setSprinting(horizontalDistance > 1.6D || player.isSprinting());

        if ((offset.y > 0.45D || friend.horizontalCollision) && friend.onGround()) {
            friend.jumpFromGround();
        }

        if (horizontalDistance > 0.18D) {
            float speed = horizontalDistance > 2.4D ? 0.22F : horizontalDistance > 1.4D ? 0.16F : 0.11F;
            if (player.isSprinting()) {
                speed += 0.03F;
            }
            friend.setSpeed(speed);
            friend.travel(new Vec3(0.0D, 0.0D, 1.0D));
            return;
        }

        Vec3 velocity = friend.getDeltaMovement();
        friend.setSpeed(0.0F);
        friend.setDeltaMovement(velocity.x * 0.38D, velocity.y, velocity.z * 0.38D);
        friend.travel(Vec3.ZERO);
    }

    private static void holdPose(ClientLevel level, LocalPlayer player, Vec3 target) {
        if (friend == null) {
            return;
        }

        Vec3 anchor = target == null ? friend.position() : target;
        teleportFriend(anchor, player);
        friend.setSprinting(false);
        friend.setSpeed(0.0F);
        friend.setDeltaMovement(Vec3.ZERO);
        friend.travel(Vec3.ZERO);

        float lookYawToPlayer = lookYaw(friend.position(), player.position());
        float bodyYaw = Mth.approachDegrees(friend.yBodyRot, lookYawToPlayer, 8.0F);
        friend.yBodyRot = bodyYaw;
        friend.yBodyRotO = bodyYaw;
        friend.setYRot(bodyYaw);

        switch (behavior) {
            case OBSERVE -> {
                clearPoseOverrides();
                friend.setYHeadRot(Mth.approachDegrees(friend.getYHeadRot(), observeYaw, 5.0F));
                if ((behaviorTicksRemaining % 14) == 0) {
                    observeYaw += level.random.nextBoolean() ? 18.0F : -18.0F;
                }
            }
            case PRAY -> {
                clearPoseOverrides();
                friend.setYHeadRot(Mth.approachDegrees(friend.getYHeadRot(), lookYawToPlayer, 6.0F));
                friend.setXRot(18.0F);
                if ((behaviorTicksRemaining % 18) == 0) {
                    spawnSubtleHalo(level);
                }
            }
            case CROUCH -> {
                friend.setShiftKeyDown(true);
                friend.setPose(Pose.CROUCHING);
                friend.setYHeadRot(Mth.approachDegrees(friend.getYHeadRot(), lookYawToPlayer, 6.0F));
            }
            case SIT -> {
                friend.setShiftKeyDown(true);
                friend.setPose(Pose.SITTING);
                friend.setYHeadRot(Mth.approachDegrees(friend.getYHeadRot(), lookYawToPlayer, 5.0F));
            }
            case EAT -> {
                clearPoseOverrides();
                if (friend.getUseItemRemainingTicks() <= 0) {
                    friend.startUsingItem(InteractionHand.MAIN_HAND);
                }
                friend.setYHeadRot(Mth.approachDegrees(friend.getYHeadRot(), lookYawToPlayer, 6.0F));
                if ((behaviorTicksRemaining % EAT_SOUND_INTERVAL) == 0) {
                    friend.swing(InteractionHand.MAIN_HAND, true);
                    level.playLocalSound(friend, SoundEvents.GENERIC_EAT.value(), SoundSource.PLAYERS, 0.52F, 0.9F + (level.random.nextFloat() * 0.24F));
                }
                if (behaviorTicksRemaining <= 1) {
                    level.playLocalSound(friend, SoundEvents.PLAYER_BURP, SoundSource.PLAYERS, 0.28F, 1.0F);
                }
            }
            case DRINK -> {
                clearPoseOverrides();
                if (friend.getUseItemRemainingTicks() <= 0) {
                    friend.startUsingItem(InteractionHand.MAIN_HAND);
                }
                friend.setYHeadRot(Mth.approachDegrees(friend.getYHeadRot(), lookYawToPlayer, 6.0F));
                if ((behaviorTicksRemaining % 10) == 0) {
                    level.playLocalSound(friend, SoundEvents.GENERIC_DRINK.value(), SoundSource.PLAYERS, 0.35F, 1.0F + (level.random.nextFloat() * 0.1F));
                }
                if ((behaviorTicksRemaining % 12) == 0) {
                    spawnPotionParticles(level);
                }
            }
            default -> clearPoseOverrides();
        }
    }

    private static void startBehavior(FriendBehavior next, int durationTicks, Vec3 anchor) {
        behavior = next;
        behaviorTicksRemaining = durationTicks;
        behaviorCooldownTicks = SPECIAL_MIN_COOLDOWN;
        behaviorAnchor = anchor;
    }

    private static void endBehavior() {
        if (friend != null) {
            friend.stopUsingItem();
        }
        behavior = FriendBehavior.FOLLOW;
        behaviorTicksRemaining = 0;
        behaviorAnchor = null;
        clearPoseOverrides();
        equipHeldItem();
    }

    private static void clearPoseOverrides() {
        if (friend == null) {
            return;
        }
        friend.setShiftKeyDown(false);
        friend.setPose(Pose.STANDING);
        friend.setXRot(0.0F);
    }

    private static Vec3 followTarget(ClientLevel level, LocalPlayer player) {
        Vec3 movement = player.getDeltaMovement();
        boolean moving = movement.horizontalDistanceSqr() > 0.0025D;
        Vec3 desired;
        if (moving) {
            Vec3 dir = new Vec3(movement.x, 0.0D, movement.z).normalize();
            Vec3 side = new Vec3(-dir.z, 0.0D, dir.x);
            double sway = Math.sin((player.tickCount + 11) * 0.12D) * 0.35D;
            desired = player.position()
                    .subtract(dir.scale(FOLLOW_DISTANCE))
                    .add(side.scale(SIDE_OFFSET + sway));
        } else {
            idleAngle += IDLE_SWAY_SPEED;
            double radius = IDLE_RADIUS + (Math.sin((player.tickCount + 11) * 0.08D) * IDLE_BOB);
            desired = player.position().add(Math.cos(idleAngle) * radius, 0.0D, Math.sin(idleAngle) * radius);
        }
        return snapToGround(level, player.position(), desired);
    }

    private static Vec3 snapToGround(ClientLevel level, Vec3 anchor, Vec3 desired) {
        int probeY = Mth.floor(Math.max(anchor.y + 3.0D, desired.y + 3.0D));
        BlockPos probe = BlockPos.containing(desired.x, probeY, desired.z);
        BlockPos surface = level.getHeightmapPos(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, probe);
        double groundY = surface.getY() + 1.0D;
        if (Math.abs(groundY - anchor.y) > MAX_HEIGHT_DELTA) {
            groundY = anchor.y;
        }
        return new Vec3(desired.x, groundY, desired.z);
    }

    private static void teleportFriend(Vec3 target, LocalPlayer player) {
        if (friend == null) {
            return;
        }
        float yaw = lookYaw(target, player.position());
        friend.teleportTo(target.x, target.y, target.z);
        friend.setPos(target.x, target.y, target.z);
        friend.setOldPosAndRot(target, yaw, 0.0F);
        friend.setDeltaMovement(Vec3.ZERO);
        friend.resetFallDistance();
        friend.setXRot(0.0F);
        friend.setYRot(yaw);
        friend.setYBodyRot(yaw);
        friend.setYHeadRot(yaw);
    }

    private static void spawnSubtleHalo(ClientLevel level) {
        if (friend == null) {
            return;
        }
        for (int i = 0; i < 6; i++) {
            double angle = (Math.PI * 2.0D * i) / 6.0D;
            level.addAlwaysVisibleParticle(
                    ParticleTypes.END_ROD,
                    friend.getX() + (Math.cos(angle) * 0.45D),
                    friend.getY() + 1.85D + (level.random.nextDouble() * 0.12D),
                    friend.getZ() + (Math.sin(angle) * 0.45D),
                    0.0D,
                    0.01D,
                    0.0D
            );
        }
    }

    private static void spawnPotionParticles(ClientLevel level) {
        if (friend == null) {
            return;
        }
        for (int i = 0; i < 4; i++) {
            level.addAlwaysVisibleParticle(
                    ParticleTypes.WITCH,
                    friend.getX() + ((level.random.nextDouble() - 0.5D) * 0.6D),
                    friend.getY() + 1.4D + (level.random.nextDouble() * 0.3D),
                    friend.getZ() + ((level.random.nextDouble() - 0.5D) * 0.6D),
                    0.0D,
                    0.02D,
                    0.0D
            );
        }
    }

    private static float lookYaw(Vec3 from, Vec3 to) {
        return (float) (Math.toDegrees(Math.atan2(to.z - from.z, to.x - from.x)) - 90.0D);
    }

    @SuppressWarnings("unused")
    private static void playLocal(ClientLevel level, SoundEvent sound, float volume, float pitch) {
        level.playLocalSound(friend, sound, SoundSource.PLAYERS, volume, pitch);
    }

    private enum FriendBehavior {
        FOLLOW,
        WANDER,
        OBSERVE,
        PRAY,
        CROUCH,
        SIT,
        EAT,
        DRINK
    }
}
