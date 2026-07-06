package club.peacefulvanilla.pvcfinder.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
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

import java.util.List;
import java.util.UUID;

public final class ImaginaryFriendController {
    private static final int FRIEND_ENTITY_ID_BASE = -904201;
    private static final double FOLLOW_DISTANCE = 4.2D;
    private static final double IDLE_RADIUS = 4.35D;
    private static final double IDLE_SWAY_SPEED = 0.018D;
    private static final double IDLE_BOB = 0.32D;
    private static final double TELEPORT_DISTANCE_SQR = 28.0D * 28.0D;
    private static final double MAX_HEIGHT_DELTA = 5.5D;
    private static final int ITEM_ROTATION_TICKS = 20 * 45;
    private static final int SPECIAL_MIN_COOLDOWN = 48;
    private static final int EAT_SOUND_INTERVAL = 7;
    private static final int DANCE_STEP_TICKS = 7;
    private static final int PARTY_SIZE = 13;

    private static final List<PartyGuest> PARTY = List.of(
            new PartyGuest(0, ImaginaryFriendPlayer.JESUS_PROFILE),
            new PartyGuest(1, ImaginaryFriendPlayer.PartyProfile.online("Flynn")),
            new PartyGuest(2, ImaginaryFriendPlayer.PartyProfile.online("CarbonFang")),
            new PartyGuest(3, ImaginaryFriendPlayer.PartyProfile.online("generaldage")),
            new PartyGuest(4, ImaginaryFriendPlayer.PartyProfile.online("maybaer")),
            new PartyGuest(5, ImaginaryFriendPlayer.PartyProfile.online("BarbieTau")),
            new PartyGuest(6, ImaginaryFriendPlayer.PartyProfile.online("Marshall_cpp")),
            new PartyGuest(7, ImaginaryFriendPlayer.PartyProfile.online("KingNeme")),
            new PartyGuest(8, ImaginaryFriendPlayer.PartyProfile.online("zDavidMeson")),
            new PartyGuest(9, ImaginaryFriendPlayer.PartyProfile.online("tobiasvsk", UUID.fromString("172fe75a-ddec-4598-bc8c-21d7a2034625"))),
            new PartyGuest(10, ImaginaryFriendPlayer.PartyProfile.online("HippotheGamer")),
            new PartyGuest(11, ImaginaryFriendPlayer.PartyProfile.online("Loveweird")),
            new PartyGuest(12, ImaginaryFriendPlayer.PartyProfile.online("Gog333"))
    );

    private static boolean enabled;

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
            removePartyEntities();
            return;
        }

        ClientLevel level = minecraft.level;
        LocalPlayer player = minecraft.player;
        if (needsPartyRespawn(level)) {
            if (!spawnParty(level, player)) {
                return;
            }
        }

        for (PartyGuest guest : PARTY) {
            tickHeldItem(level, guest);
            tickBehaviorSelection(level, player, guest);
            applyBehavior(level, player, guest);
        }
    }

    private static boolean enable(Minecraft minecraft, boolean announce) {
        if (minecraft.level == null || minecraft.player == null) {
            return false;
        }
        enabled = true;
        if (!spawnParty(minecraft.level, minecraft.player)) {
            enabled = false;
            return false;
        }
        if (announce) {
            minecraft.player.displayClientMessage(Component.translatable("message.pvcfinder.party_spawned"), true);
        }
        return true;
    }

    private static void disable(Minecraft minecraft, boolean announce) {
        enabled = false;
        for (PartyGuest guest : PARTY) {
            guest.reset();
        }
        removePartyEntities();
        if (announce && minecraft.player != null) {
            minecraft.player.displayClientMessage(Component.translatable("message.pvcfinder.party_despawned"), true);
        }
    }

    private static boolean needsPartyRespawn(ClientLevel level) {
        for (PartyGuest guest : PARTY) {
            if (guest.friend == null || guest.friend.isRemoved() || guest.friend.level() != level) {
                return true;
            }
        }
        return false;
    }

    private static boolean spawnParty(ClientLevel level, LocalPlayer player) {
        removePartyEntities();
        for (PartyGuest guest : PARTY) {
            guest.prepare(player);
            guest.friend = new ImaginaryFriendPlayer(level, guest.profile);
            guest.friend.setId(FRIEND_ENTITY_ID_BASE - guest.index);
            guest.friend.setUUID(guest.profile.entityId());
            equipHeldItem(guest);
            teleportFriend(guest, followTarget(level, player, guest), player);
            level.addEntity(guest.friend);
            if (!level.players().contains(guest.friend)) {
                level.players().add(guest.friend);
            }
        }
        return true;
    }

    private static void removePartyEntities() {
        for (PartyGuest guest : PARTY) {
            removeFriendEntity(guest);
        }
    }

    private static void removeFriendEntity(PartyGuest guest) {
        if (guest.friend == null) {
            return;
        }
        if (guest.friend.level() instanceof ClientLevel level) {
            level.players().remove(guest.friend);
            if (level.getEntity(guest.friend.getId()) != null) {
                level.removeEntity(guest.friend.getId(), Entity.RemovalReason.DISCARDED);
            }
        }
        guest.friend = null;
    }

    private static void tickHeldItem(ClientLevel level, PartyGuest guest) {
        if (guest.friend == null) {
            return;
        }
        if (guest.behavior == FriendBehavior.EAT || guest.behavior == FriendBehavior.DRINK) {
            return;
        }
        if (--guest.itemRotationTicks > 0) {
            equipHeldItem(guest);
            return;
        }

        guest.heldItemIndex = (guest.heldItemIndex + 1) % 5;
        guest.itemRotationTicks = ITEM_ROTATION_TICKS + (guest.index * 11);
        equipHeldItem(guest);
        if (guest.heldItemIndex == 1) {
            level.playLocalSound(guest.friend, SoundEvents.TOTEM_USE, SoundSource.PLAYERS, 0.12F, 1.55F);
            spawnPartySparkles(level, guest);
        } else if (guest.heldItemIndex == 2) {
            level.playLocalSound(guest.friend, SoundEvents.FISHING_BOBBER_SPLASH, SoundSource.PLAYERS, 0.09F, 1.15F);
        }
    }

    private static void equipHeldItem(PartyGuest guest) {
        if (guest.friend == null) {
            return;
        }
        guest.friend.stopUsingItem();
        guest.friend.setItemInHand(InteractionHand.MAIN_HAND, switch (guest.heldItemIndex) {
            case 1 -> new ItemStack(Items.TOTEM_OF_UNDYING);
            case 2 -> new ItemStack(Items.SALMON);
            case 3 -> PotionContents.createItemStack(Items.POTION, Potions.REGENERATION);
            case 4 -> new ItemStack(Items.GLOWSTONE_DUST);
            default -> new ItemStack(Items.BREAD);
        });
    }

    private static void tickBehaviorSelection(ClientLevel level, LocalPlayer player, PartyGuest guest) {
        if (guest.friend == null) {
            return;
        }
        if (guest.behaviorCooldownTicks > 0) {
            guest.behaviorCooldownTicks--;
        }

        if (guest.behavior != FriendBehavior.FOLLOW) {
            if (requiresStableGround(guest.behavior) && !isStableOnGround(guest)) {
                endBehavior(guest);
                return;
            }
            if (guest.friend.position().distanceToSqr(player.position()) > 16.0D * 16.0D) {
                endBehavior(guest);
                return;
            }
            if (--guest.behaviorTicksRemaining <= 0) {
                endBehavior(guest);
            }
            return;
        }

        if (guest.behaviorCooldownTicks > 0 || !isStableOnGround(guest)) {
            return;
        }

        int roll = level.random.nextInt(360);
        if (roll < 18) {
            startBehavior(guest, FriendBehavior.DANCE, 34 + level.random.nextInt(46), guest.friend.position());
            if ((guest.index % 4) == 0) {
                level.playLocalSound(guest.friend, SoundEvents.NOTE_BLOCK_BELL.value(), SoundSource.PLAYERS, 0.18F, 1.35F + (level.random.nextFloat() * 0.4F));
            }
            return;
        }
        if (roll < 22) {
            startBehavior(guest, FriendBehavior.OBSERVE, 38 + level.random.nextInt(42), guest.friend.position());
            guest.observeYaw = guest.friend.getYHeadRot() + (level.random.nextBoolean() ? 55.0F : -55.0F);
            return;
        }
        if (roll < 28) {
            startBehavior(guest, FriendBehavior.CROUCH, 24 + level.random.nextInt(22), guest.friend.position());
            return;
        }
        if (roll < 32) {
            startBehavior(guest, FriendBehavior.EAT, 24 + level.random.nextInt(10), guest.friend.position());
            guest.friend.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.BREAD));
            guest.friend.startUsingItem(InteractionHand.MAIN_HAND);
            return;
        }
        if (roll < 35) {
            startBehavior(guest, FriendBehavior.DRINK, 28 + level.random.nextInt(8), guest.friend.position());
            guest.friend.setItemInHand(InteractionHand.MAIN_HAND, PotionContents.createItemStack(Items.POTION, Potions.REGENERATION));
            guest.friend.startUsingItem(InteractionHand.MAIN_HAND);
            level.playLocalSound(guest.friend, SoundEvents.WITCH_DRINK, SoundSource.PLAYERS, 0.12F, 1.15F);
            return;
        }
        if (roll < 44) {
            Vec3 wanderTarget = guest.friend.position().add(
                    (level.random.nextDouble() - 0.5D) * 3.8D,
                    0.0D,
                    (level.random.nextDouble() - 0.5D) * 3.8D
            );
            startBehavior(guest, FriendBehavior.WANDER, 42 + level.random.nextInt(34), snapToGround(level, player.position(), wanderTarget));
        }
    }

    private static void applyBehavior(ClientLevel level, LocalPlayer player, PartyGuest guest) {
        if (guest.friend == null) {
            return;
        }

        Vec3 desired = switch (guest.behavior) {
            case FOLLOW -> followTarget(level, player, guest);
            case WANDER -> guest.behaviorAnchor == null ? followTarget(level, player, guest) : guest.behaviorAnchor;
            default -> guest.behaviorAnchor == null ? guest.friend.position() : guest.behaviorAnchor;
        };

        if (guest.friend.position().distanceToSqr(player.position()) > TELEPORT_DISTANCE_SQR || guest.friend.getY() < level.getMinY() - 8.0D) {
            endBehavior(guest);
            teleportFriend(guest, followTarget(level, player, guest), player);
            return;
        }

        if (guest.behavior == FriendBehavior.FOLLOW || guest.behavior == FriendBehavior.WANDER) {
            stepFriend(level, player, guest, desired);
            return;
        }

        holdPose(level, player, guest, desired);
    }

    private static void stepFriend(ClientLevel level, LocalPlayer player, PartyGuest guest, Vec3 target) {
        if (guest.friend == null) {
            return;
        }

        clearPoseOverrides(guest);
        equipHeldItem(guest);

        Vec3 offset = target.subtract(guest.friend.position());
        double horizontalDistance = Math.hypot(offset.x, offset.z);
        float moveYaw = lookYaw(guest.friend.position(), target);
        float lookYaw = lookYaw(guest.friend.position(), player.position());
        float bodyYaw = Mth.approachDegrees(guest.friend.getYRot(), moveYaw, horizontalDistance > 1.65D ? 14.0F : 8.0F);

        guest.friend.setXRot(0.0F);
        guest.friend.setYRot(bodyYaw);
        guest.friend.setYBodyRot(bodyYaw);
        guest.friend.setYHeadRot(Mth.approachDegrees(guest.friend.getYHeadRot(), lookYaw, 18.0F));
        guest.friend.setSprinting(horizontalDistance > 2.4D || player.isSprinting());

        if ((offset.y > 0.45D || guest.friend.horizontalCollision) && guest.friend.onGround()) {
            guest.friend.jumpFromGround();
        }

        if (horizontalDistance > 0.22D) {
            float speed = horizontalDistance > 3.2D ? 0.24F : horizontalDistance > 1.9D ? 0.17F : 0.11F;
            if (player.isSprinting()) {
                speed += 0.03F;
            }
            guest.friend.setSpeed(speed);
            guest.friend.travel(new Vec3(0.0D, 0.0D, 1.0D));
            applyDancePose(level, player, guest, horizontalDistance < 1.35D);
            return;
        }

        Vec3 velocity = guest.friend.getDeltaMovement();
        guest.friend.setSpeed(0.0F);
        guest.friend.setDeltaMovement(velocity.x * 0.38D, velocity.y, velocity.z * 0.38D);
        guest.friend.travel(Vec3.ZERO);
        applyDancePose(level, player, guest, true);
    }

    private static void holdPose(ClientLevel level, LocalPlayer player, PartyGuest guest, Vec3 target) {
        if (guest.friend == null) {
            return;
        }
        if (requiresStableGround(guest.behavior) && !isStableOnGround(guest)) {
            endBehavior(guest);
            return;
        }

        Vec3 anchor = target == null ? guest.friend.position() : target;
        teleportFriend(guest, anchor, player);
        guest.friend.setSprinting(false);
        guest.friend.setSpeed(0.0F);
        guest.friend.setDeltaMovement(Vec3.ZERO);
        guest.friend.travel(Vec3.ZERO);

        float lookYawToPlayer = lookYaw(guest.friend.position(), player.position());
        float bodyYaw = Mth.approachDegrees(guest.friend.yBodyRot, lookYawToPlayer, 8.0F);
        guest.friend.yBodyRot = bodyYaw;
        guest.friend.yBodyRotO = bodyYaw;
        guest.friend.setYRot(bodyYaw);

        switch (guest.behavior) {
            case OBSERVE -> {
                clearPoseOverrides(guest);
                guest.friend.setYHeadRot(Mth.approachDegrees(guest.friend.getYHeadRot(), guest.observeYaw, 5.0F));
                if ((guest.behaviorTicksRemaining % 14) == 0) {
                    guest.observeYaw += level.random.nextBoolean() ? 18.0F : -18.0F;
                }
            }
            case DANCE -> {
                applyDancePose(level, player, guest, true);
                guest.friend.setYHeadRot(Mth.approachDegrees(guest.friend.getYHeadRot(), lookYawToPlayer, 10.0F));
                if ((guest.behaviorTicksRemaining % 12) == 0) {
                    guest.friend.swing(InteractionHand.MAIN_HAND, true);
                    spawnPartySparkles(level, guest);
                }
            }
            case CROUCH -> {
                guest.friend.setShiftKeyDown((player.tickCount + guest.index) % 10 < 5);
                guest.friend.setPose(guest.friend.isShiftKeyDown() ? Pose.CROUCHING : Pose.STANDING);
                guest.friend.setYHeadRot(Mth.approachDegrees(guest.friend.getYHeadRot(), lookYawToPlayer, 6.0F));
            }
            case EAT -> {
                clearPoseOverrides(guest);
                if (guest.friend.getUseItemRemainingTicks() <= 0) {
                    guest.friend.startUsingItem(InteractionHand.MAIN_HAND);
                }
                guest.friend.setYHeadRot(Mth.approachDegrees(guest.friend.getYHeadRot(), lookYawToPlayer, 6.0F));
                if ((guest.behaviorTicksRemaining % EAT_SOUND_INTERVAL) == 0) {
                    guest.friend.swing(InteractionHand.MAIN_HAND, true);
                    level.playLocalSound(guest.friend, SoundEvents.GENERIC_EAT.value(), SoundSource.PLAYERS, 0.34F, 0.9F + (level.random.nextFloat() * 0.24F));
                }
                if (guest.behaviorTicksRemaining <= 1) {
                    level.playLocalSound(guest.friend, SoundEvents.PLAYER_BURP, SoundSource.PLAYERS, 0.18F, 1.0F);
                }
            }
            case DRINK -> {
                clearPoseOverrides(guest);
                if (guest.friend.getUseItemRemainingTicks() <= 0) {
                    guest.friend.startUsingItem(InteractionHand.MAIN_HAND);
                }
                guest.friend.setYHeadRot(Mth.approachDegrees(guest.friend.getYHeadRot(), lookYawToPlayer, 6.0F));
                if ((guest.behaviorTicksRemaining % 10) == 0) {
                    level.playLocalSound(guest.friend, SoundEvents.GENERIC_DRINK.value(), SoundSource.PLAYERS, 0.25F, 1.0F + (level.random.nextFloat() * 0.1F));
                }
                if ((guest.behaviorTicksRemaining % 12) == 0) {
                    spawnPotionParticles(level, guest);
                }
            }
            default -> clearPoseOverrides(guest);
        }
    }

    private static void applyDancePose(ClientLevel level, LocalPlayer player, PartyGuest guest, boolean active) {
        if (guest.friend == null) {
            return;
        }
        boolean crouching = active && ((player.tickCount + guest.index * 4) / DANCE_STEP_TICKS) % 2 == 0;
        guest.friend.setShiftKeyDown(crouching);
        guest.friend.setPose(crouching ? Pose.CROUCHING : Pose.STANDING);
        if (active && ((player.tickCount + guest.index * 3) % 20) == 0) {
            guest.friend.swing(InteractionHand.MAIN_HAND, true);
            if ((guest.index % 5) == 0) {
                level.playLocalSound(guest.friend, SoundEvents.NOTE_BLOCK_HAT.value(), SoundSource.PLAYERS, 0.08F, 1.5F);
            }
        }
    }

    private static void startBehavior(PartyGuest guest, FriendBehavior next, int durationTicks, Vec3 anchor) {
        guest.behavior = next;
        guest.behaviorTicksRemaining = durationTicks;
        guest.behaviorCooldownTicks = SPECIAL_MIN_COOLDOWN + (guest.index * 2);
        guest.behaviorAnchor = anchor;
    }

    private static void endBehavior(PartyGuest guest) {
        if (guest.friend != null) {
            guest.friend.stopUsingItem();
        }
        guest.behavior = FriendBehavior.FOLLOW;
        guest.behaviorTicksRemaining = 0;
        guest.behaviorAnchor = null;
        clearPoseOverrides(guest);
        equipHeldItem(guest);
    }

    private static void clearPoseOverrides(PartyGuest guest) {
        if (guest.friend == null) {
            return;
        }
        guest.friend.setShiftKeyDown(false);
        guest.friend.setPose(Pose.STANDING);
        guest.friend.setXRot(0.0F);
    }

    private static boolean isStableOnGround(PartyGuest guest) {
        if (guest.friend == null) {
            return false;
        }
        return guest.friend.onGround()
                && !guest.friend.isFallFlying()
                && !guest.friend.isSwimming()
                && !guest.friend.isPassenger()
                && Math.abs(guest.friend.getDeltaMovement().y) < 0.08D;
    }

    private static boolean requiresStableGround(FriendBehavior behavior) {
        return switch (behavior) {
            case OBSERVE, DANCE, CROUCH, EAT, DRINK -> true;
            default -> false;
        };
    }

    private static Vec3 followTarget(ClientLevel level, LocalPlayer player, PartyGuest guest) {
        Vec3 movement = player.getDeltaMovement();
        boolean moving = movement.horizontalDistanceSqr() > 0.0025D;
        Vec3 desired;
        if (moving) {
            Vec3 dir = new Vec3(movement.x, 0.0D, movement.z).normalize();
            Vec3 side = new Vec3(-dir.z, 0.0D, dir.x);
            double sway = Math.sin((player.tickCount + guest.index * 9) * 0.12D) * 0.28D;
            desired = player.position()
                    .subtract(dir.scale(movingBackOffset(guest.index)))
                    .add(side.scale(movingSideOffset(guest.index) + sway));
        } else {
            guest.idleAngle += IDLE_SWAY_SPEED * (0.75D + (guest.index % 4) * 0.08D);
            double radius = IDLE_RADIUS + ((guest.index % 3) * 0.28D) + (Math.sin((player.tickCount + guest.index * 11) * 0.08D) * IDLE_BOB);
            desired = player.position().add(Math.cos(guest.idleAngle) * radius, 0.0D, Math.sin(guest.idleAngle) * radius);
        }
        return snapToGround(level, player.position(), desired);
    }

    private static double movingBackOffset(int index) {
        return FOLLOW_DISTANCE + ((index / 5) * 1.35D);
    }

    private static double movingSideOffset(int index) {
        int[] columns = {0, -1, 1, -2, 2, 0, -1, 1, -2, 2, 0, -1, 1};
        return columns[index] * 1.35D;
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

    private static void teleportFriend(PartyGuest guest, Vec3 target, LocalPlayer player) {
        if (guest.friend == null) {
            return;
        }
        float yaw = lookYaw(target, player.position());
        guest.friend.teleportTo(target.x, target.y, target.z);
        guest.friend.setPos(target.x, target.y, target.z);
        guest.friend.setOldPosAndRot(target, yaw, 0.0F);
        guest.friend.setDeltaMovement(Vec3.ZERO);
        guest.friend.resetFallDistance();
        guest.friend.setXRot(0.0F);
        guest.friend.setYRot(yaw);
        guest.friend.setYBodyRot(yaw);
        guest.friend.setYHeadRot(yaw);
    }

    private static void spawnPartySparkles(ClientLevel level, PartyGuest guest) {
        if (guest.friend == null) {
            return;
        }
        for (int i = 0; i < 5; i++) {
            double angle = (Math.PI * 2.0D * i) / 5.0D;
            level.addAlwaysVisibleParticle(
                    (i & 1) == 0 ? ParticleTypes.HAPPY_VILLAGER : ParticleTypes.END_ROD,
                    guest.friend.getX() + (Math.cos(angle) * 0.45D),
                    guest.friend.getY() + 1.35D + (level.random.nextDouble() * 0.5D),
                    guest.friend.getZ() + (Math.sin(angle) * 0.45D),
                    0.0D,
                    0.02D,
                    0.0D
            );
        }
    }

    private static void spawnPotionParticles(ClientLevel level, PartyGuest guest) {
        if (guest.friend == null) {
            return;
        }
        for (int i = 0; i < 4; i++) {
            level.addAlwaysVisibleParticle(
                    ParticleTypes.WITCH,
                    guest.friend.getX() + ((level.random.nextDouble() - 0.5D) * 0.6D),
                    guest.friend.getY() + 1.4D + (level.random.nextDouble() * 0.3D),
                    guest.friend.getZ() + ((level.random.nextDouble() - 0.5D) * 0.6D),
                    0.0D,
                    0.02D,
                    0.0D
            );
        }
    }

    private static float lookYaw(Vec3 from, Vec3 to) {
        return (float) (Math.toDegrees(Math.atan2(to.z - from.z, to.x - from.x)) - 90.0D);
    }

    private enum FriendBehavior {
        FOLLOW,
        WANDER,
        OBSERVE,
        DANCE,
        CROUCH,
        EAT,
        DRINK
    }

    private static final class PartyGuest {
        private final int index;
        private final ImaginaryFriendPlayer.PartyProfile profile;
        private ImaginaryFriendPlayer friend;
        private double idleAngle;
        private int itemRotationTicks;
        private int heldItemIndex;
        private int behaviorTicksRemaining;
        private int behaviorCooldownTicks;
        private FriendBehavior behavior = FriendBehavior.FOLLOW;
        private Vec3 behaviorAnchor;
        private float observeYaw;

        private PartyGuest(int index, ImaginaryFriendPlayer.PartyProfile profile) {
            this.index = index;
            this.profile = profile;
        }

        private void prepare(LocalPlayer player) {
            reset();
            idleAngle = Math.toRadians(player.getYRot() - 90.0F) + ((Math.PI * 2.0D * index) / PARTY_SIZE);
            itemRotationTicks = ITEM_ROTATION_TICKS + (index * 17);
            behaviorCooldownTicks = 35 + (index * 4);
            heldItemIndex = index % 5;
        }

        private void reset() {
            itemRotationTicks = 0;
            heldItemIndex = 0;
            behaviorTicksRemaining = 0;
            behaviorCooldownTicks = 0;
            behavior = FriendBehavior.FOLLOW;
            behaviorAnchor = null;
            observeYaw = 0.0F;
        }
    }
}
