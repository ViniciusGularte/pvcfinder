package club.peacefulvanilla.pvcfinder.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
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
    private static final int EAT_INTERVAL_TICKS = 180;
    private static final int EAT_DURATION_TICKS = 28;
    private static final int EAT_SOUND_INTERVAL = 7;

    private static ImaginaryFriendPlayer friend;
    private static boolean enabled;
    private static double idleAngle;
    private static int eatCooldownTicks;
    private static int eatTicksRemaining;

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

        Vec3 desired = followTarget(level, player);
        if (friend.position().distanceToSqr(player.position()) > TELEPORT_DISTANCE_SQR || friend.getY() < level.getMinY() - 8.0D) {
            teleportFriend(desired, player);
            return;
        }

        stepFriend(player, desired);
        tickEating(level);
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
        eatCooldownTicks = 0;
        eatTicksRemaining = 0;
        removeFriendEntity();
        if (announce && minecraft.player != null) {
            minecraft.player.displayClientMessage(Component.translatable("message.pvcfinder.jesus_despawned"), true);
        }
    }

    private static boolean spawnFriend(ClientLevel level, LocalPlayer player) {
        removeFriendEntity();
        idleAngle = Math.toRadians(player.getYRot() - 35.0F);
        eatCooldownTicks = 90;
        eatTicksRemaining = 0;
        friend = new ImaginaryFriendPlayer(level);
        friend.setId(FRIEND_ENTITY_ID);
        friend.setUUID(ImaginaryFriendPlayer.PROFILE_ID);
        friend.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.BREAD));
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

    private static void stepFriend(LocalPlayer player, Vec3 target) {
        if (friend == null) {
            return;
        }

        Vec3 offset = target.subtract(friend.position());
        double horizontalDistance = Math.hypot(offset.x, offset.z);
        float moveYaw = lookYaw(friend.position(), target);
        float lookYaw = lookYaw(friend.position(), player.position());
        float bodyYaw = Mth.approachDegrees(friend.getYRot(), moveYaw, horizontalDistance > 1.25D ? 14.0F : 8.0F);
        friend.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.BREAD));

        friend.setXRot(0.0F);
        friend.setYRot(bodyYaw);
        friend.setYBodyRot(bodyYaw);
        friend.setYHeadRot(Mth.approachDegrees(friend.getYHeadRot(), lookYaw, 18.0F));
        friend.setSprinting(horizontalDistance > 1.6D);

        if ((offset.y > 0.45D || friend.horizontalCollision) && friend.onGround()) {
            friend.jumpFromGround();
        }

        if (horizontalDistance > 0.18D) {
            friend.setSpeed(horizontalDistance > 2.0D ? 0.18F : 0.12F);
            friend.travel(new Vec3(0.0D, 0.0D, 1.0D));
            return;
        }

        Vec3 velocity = friend.getDeltaMovement();
        friend.setSpeed(0.0F);
        friend.setDeltaMovement(velocity.x * 0.45D, velocity.y, velocity.z * 0.45D);
        friend.travel(Vec3.ZERO);
    }

    private static void tickEating(ClientLevel level) {
        if (friend == null) {
            return;
        }

        if (eatTicksRemaining > 0) {
            if (friend.getUseItemRemainingTicks() <= 0) {
                friend.startUsingItem(InteractionHand.MAIN_HAND);
            }
            if ((eatTicksRemaining % EAT_SOUND_INTERVAL) == 0) {
                friend.swing(InteractionHand.MAIN_HAND, true);
                level.playLocalSound(friend, SoundEvents.GENERIC_EAT.value(), SoundSource.PLAYERS, 0.55F, 0.9F + (level.random.nextFloat() * 0.25F));
            }
            eatTicksRemaining--;
            if (eatTicksRemaining == 0) {
                friend.stopUsingItem();
                level.playLocalSound(friend, SoundEvents.PLAYER_BURP, SoundSource.PLAYERS, 0.35F, 0.95F + (level.random.nextFloat() * 0.1F));
                eatCooldownTicks = EAT_INTERVAL_TICKS + level.random.nextInt(80);
            }
            return;
        }

        if (eatCooldownTicks > 0) {
            eatCooldownTicks--;
            return;
        }

        eatTicksRemaining = EAT_DURATION_TICKS;
        friend.startUsingItem(InteractionHand.MAIN_HAND);
    }

    private static float lookYaw(Vec3 from, Vec3 to) {
        return (float) (Math.toDegrees(Math.atan2(to.z - from.z, to.x - from.x)) - 90.0D);
    }
}
