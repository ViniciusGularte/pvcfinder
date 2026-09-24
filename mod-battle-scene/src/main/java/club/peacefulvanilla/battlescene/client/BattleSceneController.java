package club.peacefulvanilla.battlescene.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Pose;
import net.minecraft.world.entity.projectile.Arrow;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.DyedItemColor;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public final class BattleSceneController {
    private static final int ENTITY_ID_BASE = -725500;
    private static final int PROJECTILE_ID_BASE = -825500;
    private static final int BLUE_LEATHER = 0x2855D9;
    private static final int RED_LEATHER = 0xBB2E2E;
    private static final int OPENING_CHARGE_TICKS = 95;
    private static final double ARENA_RADIUS = 21.0D;
    private static final double MAX_HEIGHT_DELTA = 8.0D;
    private static final BattleSceneSettings SETTINGS = BattleSceneSettings.INSTANCE;
    private static final List<Soldier> SOLDIERS = createSoldiers();

    private static boolean enabled;
    private static int sceneTicks;
    private static int nextProjectileId;
    private static Vec3 sceneAnchor;
    private static Vec3 sceneForward;
    private static Vec3 sceneRight;
    private static ResourceKey<Level> sceneDimension;

    private BattleSceneController() {
    }

    public static boolean isActive() {
        return enabled;
    }

    public static void toggle(Minecraft minecraft) {
        if (enabled) {
            disable(minecraft, true);
            return;
        }
        enable(minecraft, true);
    }

    public static void restartIfActive(Minecraft minecraft) {
        if (enabled) {
            enable(minecraft, false);
        }
    }

    public static void tick(Minecraft minecraft) {
        if (!enabled) {
            return;
        }
        if (minecraft.level == null || minecraft.player == null || sceneAnchor == null || sceneForward == null || sceneRight == null) {
            enabled = false;
            removeBattleEntities();
            return;
        }
        if (!minecraft.level.dimension().equals(sceneDimension)) {
            removeBattleEntities();
            return;
        }

        ClientLevel level = minecraft.level;
        if (needsRespawn(level)) {
            spawnBattle(level);
        }

        sceneTicks++;
        for (Soldier soldier : SOLDIERS) {
            if (!isActiveSoldier(soldier)) {
                removeSoldierEntity(soldier);
                continue;
            }
            tickSoldier(level, soldier);
        }
    }

    private static void enable(Minecraft minecraft, boolean announce) {
        if (minecraft.level == null || minecraft.player == null) {
            return;
        }
        configureScene(minecraft);
        enabled = true;
        sceneTicks = 0;
        nextProjectileId = 0;
        spawnBattle(minecraft.level);
        if (announce) {
            minecraft.player.displayClientMessage(Component.literal("Battle scene iniciada."), true);
        }
    }

    private static void disable(Minecraft minecraft, boolean announce) {
        enabled = false;
        removeBattleEntities();
        for (Soldier soldier : SOLDIERS) {
            soldier.reset();
        }
        if (announce && minecraft.player != null) {
            minecraft.player.displayClientMessage(Component.literal("Battle scene removida."), true);
        }
    }

    private static void configureScene(Minecraft minecraft) {
        BattleSceneSettings.TeamSpawn blue = validSpawn(SETTINGS.blueSpawn, minecraft.level.dimension()) ? SETTINGS.blueSpawn : null;
        BattleSceneSettings.TeamSpawn red = validSpawn(SETTINGS.redSpawn, minecraft.level.dimension()) ? SETTINGS.redSpawn : null;

        if (blue != null && red != null) {
            sceneAnchor = blue.position().add(red.position()).scale(0.5D);
            sceneRight = red.position().subtract(blue.position());
            sceneRight = sceneRight.horizontalDistanceSqr() > 0.01D
                    ? new Vec3(sceneRight.x, 0.0D, sceneRight.z).normalize()
                    : new Vec3(1.0D, 0.0D, 0.0D);
            sceneForward = new Vec3(-sceneRight.z, 0.0D, sceneRight.x).normalize();
        } else if (blue != null || red != null) {
            sceneForward = forwardVector(minecraft.player.getYRot());
            sceneRight = new Vec3(sceneForward.z, 0.0D, -sceneForward.x);
            Vec3 fixed = blue != null ? blue.position() : red.position();
            double side = blue != null ? 1.0D : -1.0D;
            sceneAnchor = fixed.add(sceneRight.scale(side * 10.0D * SETTINGS.spread));
        } else {
            sceneAnchor = minecraft.player.position();
            sceneForward = forwardVector(minecraft.player.getYRot());
            sceneRight = new Vec3(sceneForward.z, 0.0D, -sceneForward.x);
        }
        sceneDimension = minecraft.level.dimension();
    }

    private static boolean validSpawn(BattleSceneSettings.TeamSpawn spawn, ResourceKey<Level> dimension) {
        return spawn != null && spawn.dimension().equals(dimension);
    }

    private static boolean needsRespawn(ClientLevel level) {
        for (Soldier soldier : SOLDIERS) {
            if (!isActiveSoldier(soldier)) {
                continue;
            }
            if (soldier.actor == null || soldier.actor.isRemoved() || soldier.actor.level() != level) {
                return true;
            }
        }
        return false;
    }

    private static void spawnBattle(ClientLevel level) {
        removeBattleEntities();
        for (Soldier soldier : SOLDIERS) {
            if (!isActiveSoldier(soldier)) {
                continue;
            }
            soldier.prepare();
            soldier.actor = new BattleActorPlayer(level, soldier.profile);
            soldier.actor.setId(ENTITY_ID_BASE - soldier.index);
            soldier.actor.setUUID(soldier.profile.entityId());
            equipSoldier(soldier);
            teleportEntity(soldier.actor, entryPosition(level, soldier), sceneAnchor);
            level.addEntity(soldier.actor);
            if (!level.players().contains(soldier.actor)) {
                level.players().add(soldier.actor);
            }
        }
    }

    private static void removeBattleEntities() {
        for (Soldier soldier : SOLDIERS) {
            removeSoldierEntity(soldier);
        }
    }

    private static void removeSoldierEntity(Soldier soldier) {
        if (soldier.actor == null) {
            return;
        }
        if (soldier.actor.level() instanceof ClientLevel level) {
            level.players().remove(soldier.actor);
            if (level.getEntity(soldier.actor.getId()) != null) {
                level.removeEntity(soldier.actor.getId(), Entity.RemovalReason.DISCARDED);
            }
        }
        soldier.actor = null;
    }

    private static void tickSoldier(ClientLevel level, Soldier soldier) {
        if (soldier.actor == null) {
            return;
        }
        Soldier enemy = enemyFor(soldier);
        if (enemy.actor == null) {
            return;
        }

        if (--soldier.decisionTicks <= 0) {
            chooseNextMove(level, soldier);
        }

        Vec3 target = sceneTicks < OPENING_CHARGE_TICKS
                ? stagingPosition(level, soldier)
                : combatTarget(level, soldier, enemy);
        target = applySeparation(target, soldier);
        stepToward(level, soldier, enemy, target);
        if (sceneTicks > OPENING_CHARGE_TICKS - 25) {
            tickAttack(level, soldier, enemy);
        }
        keepInsideArena(level, soldier, enemy);
    }

    private static void chooseNextMove(ClientLevel level, Soldier soldier) {
        soldier.decisionTicks = 46 + level.random.nextInt(70);
        soldier.orbitDirection = level.random.nextBoolean() ? 1.0D : -1.0D;
        soldier.flankBias = (level.random.nextDouble() - 0.5D) * 7.5D * SETTINGS.spread;
        soldier.pressure = 0.85D + level.random.nextDouble() * 0.55D;
        equipSoldier(soldier);
        soldier.guardTicks = currentHasShield(soldier) && level.random.nextInt(4) == 0 ? 18 + level.random.nextInt(22) : 0;
        soldier.repositionTicks = currentRole(soldier) == Role.ARCHER || level.random.nextInt(4) == 0 ? 36 + level.random.nextInt(44) : 0;
    }

    private static Vec3 combatTarget(ClientLevel level, Soldier soldier, Soldier enemy) {
        Role role = currentRole(soldier);
        if (role == Role.ARCHER) {
            return archerNest(level, soldier, enemy);
        }

        Vec3 enemyPos = enemy.actor.position();
        Vec3 away = enemyPos.subtract(sceneAnchor);
        if (away.horizontalDistanceSqr() < 0.01D) {
            away = formationPosition(level, soldier).subtract(sceneAnchor);
        }
        Vec3 radial = new Vec3(away.x, 0.0D, away.z).normalize();
        Vec3 side = new Vec3(-radial.z, 0.0D, radial.x).scale(soldier.orbitDirection);
        double desiredRange = switch (role) {
            case BERSERKER -> 2.7D;
            case SHIELD -> soldier.guardTicks > 0 ? 4.0D : 3.0D;
            default -> 3.0D;
        };
        double sideOffset = switch (role) {
            case BERSERKER -> laneOffset(soldier) + soldier.flankBias * 0.45D;
            case SHIELD -> laneOffset(soldier) * 0.9D + soldier.flankBias * 0.45D;
            default -> laneOffset(soldier) + soldier.flankBias * 0.55D;
        } * SETTINGS.spread;

        Vec3 desired = enemyPos.subtract(radial.scale(desiredRange * soldier.pressure)).add(side.scale(sideOffset));
        if (soldier.team == Team.BLUE) {
            desired = desired.add(side.scale(0.8D));
        } else {
            desired = desired.subtract(side.scale(0.8D));
        }
        if (desired.distanceToSqr(sceneAnchor) > ARENA_RADIUS * ARENA_RADIUS) {
            desired = sceneAnchor.add(desired.subtract(sceneAnchor).normalize().scale(ARENA_RADIUS - 1.5D));
        }
        return snapToGround(level, sceneAnchor, desired);
    }

    private static Vec3 applySeparation(Vec3 target, Soldier soldier) {
        if (soldier.actor == null) {
            return target;
        }
        Vec3 push = Vec3.ZERO;
        Vec3 pos = soldier.actor.position();
        for (Soldier other : SOLDIERS) {
            if (other == soldier || other.actor == null) {
                continue;
            }
            Vec3 away = pos.subtract(other.actor.position());
            double distanceSqr = away.horizontalDistanceSqr();
            double personalSpace = 5.5D * SETTINGS.spread;
            if (distanceSqr > 0.001D && distanceSqr < personalSpace) {
                double strength = other.team == soldier.team ? 2.2D : 1.35D;
                push = push.add(new Vec3(away.x, 0.0D, away.z).normalize().scale((personalSpace - distanceSqr) * 0.08D * strength));
            }
        }
        return target.add(push);
    }

    private static Vec3 navigationTarget(ClientLevel level, Soldier soldier, Vec3 target) {
        BattleActorPlayer actor = soldier.actor;
        Vec3 pos = actor.position();
        if (actor.isInWater()) {
            soldier.hazardTicks = Math.max(soldier.hazardTicks, 18);
            Vec3 dry = nearestSaferOffset(level, pos, 5.0D, false);
            if (dry != null) {
                return dry;
            }
        }
        if (actor.isInLava() || actor.isOnFire()) {
            actor.clearFire();
            soldier.hazardTicks = Math.max(soldier.hazardTicks, 32);
            Vec3 safe = nearestSaferOffset(level, pos, 7.0D, true);
            if (safe != null) {
                return safe;
            }
            return sceneAnchor;
        }
        if (soldier.hazardTicks > 0) {
            soldier.hazardTicks--;
        }

        Vec3 eye = pos.add(0.0D, 1.1D, 0.0D);
        Vec3 to = target.add(0.0D, 1.0D, 0.0D);
        boolean blocked = level.clip(new ClipContext(eye, to, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, actor)).getType() == HitResult.Type.BLOCK;
        if (blocked || actor.horizontalCollision) {
            if (soldier.pathTicks <= 0 || actor.horizontalCollision) {
                soldier.pathSide = soldier.pathSide == 0.0D ? (level.random.nextBoolean() ? 1.0D : -1.0D) : -soldier.pathSide;
                soldier.pathTicks = 26 + level.random.nextInt(22);
            }
        }
        if (soldier.pathTicks > 0) {
            soldier.pathTicks--;
            Vec3 direct = target.subtract(pos);
            Vec3 forward = direct.horizontalDistanceSqr() > 0.01D ? new Vec3(direct.x, 0.0D, direct.z).normalize() : sceneForward;
            Vec3 side = new Vec3(-forward.z, 0.0D, forward.x).scale(soldier.pathSide);
            Vec3 bypass = pos.add(forward.scale(2.2D)).add(side.scale(4.2D * SETTINGS.spread));
            if (!isDangerous(level, bypass)) {
                return snapToGround(level, sceneAnchor, bypass);
            }
        }
        return target;
    }

    private static void stepToward(ClientLevel level, Soldier soldier, Soldier enemy, Vec3 target) {
        BattleActorPlayer actor = soldier.actor;
        Role role = currentRole(soldier);
        target = navigationTarget(level, soldier, target);
        Vec3 offset = target.subtract(actor.position());
        double horizontalDistance = Math.hypot(offset.x, offset.z);
        double enemyDistance = actor.position().distanceTo(enemy.actor.position());
        float moveYaw = lookYaw(actor.position(), target);
        float lookYaw = lookYaw(actor.position(), enemy.actor.position());
        float targetBodyYaw = horizontalDistance > 0.5D ? moveYaw : lookYaw;
        float bodyYaw = Mth.approachDegrees(actor.getYRot(), targetBodyYaw, 18.0F);
        float headDelta = Mth.clamp(Mth.wrapDegrees(lookYaw - bodyYaw), -55.0F, 55.0F);
        float headYaw = bodyYaw + headDelta;

        actor.setYRot(bodyYaw);
        actor.setYBodyRot(bodyYaw);
        actor.lerpHeadTo(headYaw, 2);
        actor.setYHeadRot(Mth.approachDegrees(actor.getYHeadRot(), headYaw, 28.0F));
        actor.setXRot(role == Role.ARCHER ? -4.0F : 0.0F);

        boolean guarding = soldier.guardTicks > 0 && enemyDistance < 5.4D && currentHasShield(soldier);
        actor.setShiftKeyDown(guarding);
        actor.setPose(guarding ? Pose.CROUCHING : Pose.STANDING);
        if (guarding) {
            actor.startUsingItem(InteractionHand.OFF_HAND);
            soldier.guardTicks--;
        } else if (actor.getUsedItemHand() == InteractionHand.OFF_HAND) {
            actor.stopUsingItem();
        }

        boolean escapingFluid = actor.isInLava() || actor.isOnFire() || actor.isInWater();
        if ((offset.y > 0.45D || actor.horizontalCollision || escapingFluid) && actor.onGround()) {
            actor.setJumping(true);
            actor.jumpFromGround();
        } else {
            actor.setJumping(false);
        }

        if (horizontalDistance > 0.28D) {
            float speed = (float) switch (role) {
                case BERSERKER -> sceneTicks < OPENING_CHARGE_TICKS ? 0.25D : 0.20D;
                case ARCHER -> soldier.repositionTicks > 0 ? 0.17D : 0.105D;
                case SHIELD -> guarding ? 0.075D : 0.145D;
                case SWORD -> sceneTicks < OPENING_CHARGE_TICKS ? 0.22D : 0.16D;
            };
            if (actor.isInWater()) {
                speed *= 0.72F;
            } else if (actor.isInLava() || actor.isOnFire()) {
                speed *= 1.25F;
            }
            actor.setSprinting(role == Role.BERSERKER && enemyDistance > 3.5D);
            actor.setSpeed(speed);
            actor.travel(new Vec3(0.0D, 0.0D, 1.0D));
            actor.walkAnimation.update(speed * 6.0F, 0.55F, 1.0F);
        } else {
            Vec3 velocity = actor.getDeltaMovement();
            actor.setSprinting(false);
            actor.setSpeed(0.0F);
            actor.setDeltaMovement(velocity.x * 0.45D, velocity.y, velocity.z * 0.45D);
            actor.travel(Vec3.ZERO);
            actor.walkAnimation.update(0.0F, 0.45F, 1.0F);
        }
        if (soldier.repositionTicks > 0) {
            soldier.repositionTicks--;
        }
    }

    private static void tickAttack(ClientLevel level, Soldier soldier, Soldier enemy) {
        BattleActorPlayer actor = soldier.actor;
        Role role = currentRole(soldier);
        double distance = actor.position().distanceTo(enemy.actor.position());
        if (soldier.attackCooldown > 0) {
            soldier.attackCooldown--;
        }

        if (role == Role.ARCHER) {
            actor.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.BOW));
            if (distance < 22.0D && distance > 7.0D) {
                if (soldier.drawTicks <= 0 && soldier.attackCooldown <= 0) {
                    soldier.drawTicks = 26 + level.random.nextInt(12);
                    actor.startUsingItem(InteractionHand.MAIN_HAND);
                } else if (soldier.drawTicks > 0 && --soldier.drawTicks <= 0) {
                    actor.stopUsingItem();
                    actor.swing(InteractionHand.MAIN_HAND, true);
                    soldier.attackCooldown = 24 + level.random.nextInt(30);
                    level.playLocalSound(actor, SoundEvents.ARROW_SHOOT, SoundSource.PLAYERS, 0.45F, 0.85F + level.random.nextFloat() * 0.35F);
                    shootVisibleArrow(level, actor, enemy.actor);
                    markHit(level, soldier, enemy, false, 0.08D);
                }
            }
            return;
        }

        if (distance < 3.15D && soldier.attackCooldown <= 0) {
            actor.swing(InteractionHand.MAIN_HAND, true);
            soldier.attackCooldown = switch (role) {
                case BERSERKER -> 13 + level.random.nextInt(10);
                case SHIELD -> 22 + level.random.nextInt(16);
                default -> 17 + level.random.nextInt(12);
            };
            level.playLocalSound(actor, SoundEvents.PLAYER_ATTACK_SWEEP, SoundSource.PLAYERS, 0.38F, 0.85F + level.random.nextFloat() * 0.4F);
            markHit(level, soldier, enemy, true, 0.18D);
        }
    }

    private static void markHit(ClientLevel level, Soldier attacker, Soldier enemy, boolean melee, double shoveStrength) {
        float yaw = lookYaw(enemy.actor.position(), attacker.actor.position());
        enemy.actor.animateHurt(yaw);
        Vec3 shove = enemy.actor.position().subtract(attacker.actor.position());
        if (shove.horizontalDistanceSqr() > 0.001D) {
            LivingEntity enemyBase = enemy.actor;
            enemyBase.setDeltaMovement(enemyBase.getDeltaMovement().add(new Vec3(shove.x, 0.0D, shove.z).normalize().scale(shoveStrength)));
        }
        level.playLocalSound(enemy.actor, SoundEvents.PLAYER_HURT, SoundSource.PLAYERS, melee ? 0.32F : 0.18F, 0.9F + level.random.nextFloat() * 0.25F);
        if (melee) {
            spawnMeleeHit(level, enemy.actor.position().add(0.0D, 1.1D, 0.0D), attacker.team);
        } else {
            spawnArrowHit(level, enemy.actor.position().add(0.0D, 1.2D, 0.0D));
        }
    }

    private static void keepInsideArena(ClientLevel level, Soldier soldier, Soldier enemy) {
        if (soldier.actor.position().distanceToSqr(sceneAnchor) < (ARENA_RADIUS + 4.0D) * (ARENA_RADIUS + 4.0D)) {
            return;
        }
        teleportEntity(soldier.actor, formationPosition(level, soldier), enemy.actor.position());
    }

    private static void equipSoldier(Soldier soldier) {
        if (soldier.actor == null) {
            return;
        }
        int color = soldier.team == Team.BLUE ? BLUE_LEATHER : RED_LEATHER;
        Role role = currentRole(soldier);
        soldier.actor.setItemSlot(EquipmentSlot.HEAD, dyedLeather(Items.LEATHER_HELMET.getDefaultInstance(), color));
        soldier.actor.setItemSlot(EquipmentSlot.CHEST, dyedLeather(Items.LEATHER_CHESTPLATE.getDefaultInstance(), color));
        soldier.actor.setItemSlot(EquipmentSlot.LEGS, dyedLeather(Items.LEATHER_LEGGINGS.getDefaultInstance(), color));
        soldier.actor.setItemSlot(EquipmentSlot.FEET, dyedLeather(Items.LEATHER_BOOTS.getDefaultInstance(), color));
        soldier.actor.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(role == Role.ARCHER ? Items.BOW : Items.IRON_SWORD));
        soldier.actor.setItemInHand(InteractionHand.OFF_HAND, currentHasShield(soldier) ? new ItemStack(Items.SHIELD) : ItemStack.EMPTY);
    }

    private static Vec3 entryPosition(ClientLevel level, Soldier soldier) {
        BattleSceneSettings.TeamSpawn fixed = fixedSpawn(soldier.team);
        if (fixed != null && fixed.dimension().equals(sceneDimension)) {
            double sideJitter = ((soldier.localIndex % 4) - 1.5D) * 1.15D * SETTINGS.spread;
            double backJitter = (soldier.localIndex / 4) * -1.35D * SETTINGS.spread;
            Vec3 fixedForward = forwardVector(fixed.yaw());
            Vec3 fixedRight = new Vec3(fixedForward.z, 0.0D, -fixedForward.x);
            Vec3 position = fixed.position().add(fixedRight.scale(sideJitter)).add(fixedForward.scale(backJitter));
            return new Vec3(position.x, fixed.position().y, position.z);
        }
        double side = soldier.team == Team.BLUE ? -1.0D : 1.0D;
        double sideOffset = side * (10.5D + (soldier.localIndex / 4) * 1.8D) * SETTINGS.spread;
        double forwardOffset = laneOffset(soldier) * 0.7D * SETTINGS.spread;
        return sameHeightPosition(sideOffset, forwardOffset);
    }

    private static Vec3 stagingPosition(ClientLevel level, Soldier soldier) {
        double side = soldier.team == Team.BLUE ? -1.0D : 1.0D;
        Role role = currentRole(soldier);
        double sideOffset = side * switch (role) {
            case ARCHER -> 8.5D;
            case SHIELD -> 3.2D;
            case BERSERKER -> 2.1D;
            case SWORD -> 2.6D;
        } * SETTINGS.spread;
        double forwardOffset = laneOffset(soldier) * 0.72D * SETTINGS.spread;
        return snapToGround(level, sceneAnchor, orientedPosition(sideOffset, forwardOffset));
    }

    private static Vec3 formationPosition(ClientLevel level, Soldier soldier) {
        double side = soldier.team == Team.BLUE ? -1.0D : 1.0D;
        int row = soldier.localIndex / 4;
        double sideOffset = side * (4.8D + row * 1.7D) * SETTINGS.spread;
        double forwardOffset = laneOffset(soldier) * 0.62D * SETTINGS.spread;
        return snapToGround(level, sceneAnchor, orientedPosition(sideOffset, forwardOffset));
    }

    private static Vec3 archerNest(ClientLevel level, Soldier soldier, Soldier enemy) {
        double side = soldier.team == Team.BLUE ? -1.0D : 1.0D;
        double sideOffset = side * (8.8D + (soldier.localIndex % 2) * 1.8D) * SETTINGS.spread;
        double forwardOffset = (laneOffset(soldier) * 0.8D + soldier.orbitDirection * 1.9D) * SETTINGS.spread;
        Vec3 fallback = orientedPosition(sideOffset, forwardOffset);
        Vec3 fromEnemy = soldier.actor.position().subtract(enemy.actor.position());
        if (fromEnemy.horizontalDistanceSqr() > 0.01D && soldier.actor.position().distanceToSqr(enemy.actor.position()) < 11.0D * 11.0D) {
            fallback = soldier.actor.position().add(new Vec3(fromEnemy.x, 0.0D, fromEnemy.z).normalize().scale(4.8D));
        }
        return snapToGround(level, sceneAnchor, fallback);
    }

    private static Vec3 nearestSaferOffset(ClientLevel level, Vec3 pos, double radius, boolean avoidWaterToo) {
        Vec3 best = null;
        double bestDistance = Double.MAX_VALUE;
        for (int i = 0; i < 12; i++) {
            double angle = (Math.PI * 2.0D * i) / 12.0D;
            Vec3 candidate = pos.add(Math.cos(angle) * radius, 0.0D, Math.sin(angle) * radius);
            Vec3 grounded = snapToGround(level, sceneAnchor, candidate);
            if (isDangerous(level, grounded) || (avoidWaterToo && isWater(level, grounded))) {
                continue;
            }
            double distance = grounded.distanceToSqr(sceneAnchor);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = grounded;
            }
        }
        return best;
    }

    private static void shootVisibleArrow(ClientLevel level, BattleActorPlayer archer, BattleActorPlayer target) {
        Vec3 look = target.position().add(0.0D, 1.25D, 0.0D).subtract(archer.position().add(0.0D, 1.45D, 0.0D));
        if (look.lengthSqr() < 0.001D) {
            return;
        }
        Vec3 direction = look.normalize();
        Vec3 side = new Vec3(-direction.z, 0.0D, direction.x).normalize();
        Vec3 from = archer.position().add(direction.scale(0.75D)).add(side.scale(0.28D)).add(0.0D, 1.42D, 0.0D);
        Arrow arrow = new Arrow(level, from.x, from.y, from.z, new ItemStack(Items.ARROW), new ItemStack(Items.BOW));
        arrow.setOwner(archer);
        arrow.setId(PROJECTILE_ID_BASE - nextProjectileId++);
        arrow.setUUID(syntheticUuid("arrow", nextProjectileId));
        arrow.setCritArrow(true);
        arrow.shoot(direction.x, direction.y + 0.035D, direction.z, 2.45F, 1.5F);
        level.addEntity(arrow);
    }

    private static void spawnMeleeHit(ClientLevel level, Vec3 pos, Team team) {
        for (int i = 0; i < 6; i++) {
            level.addAlwaysVisibleParticle(
                    i % 2 == 0 ? ParticleTypes.SWEEP_ATTACK : ParticleTypes.CRIT,
                    pos.x + ((level.random.nextDouble() - 0.5D) * 0.7D),
                    pos.y + ((level.random.nextDouble() - 0.5D) * 0.6D),
                    pos.z + ((level.random.nextDouble() - 0.5D) * 0.7D),
                    team == Team.BLUE ? 0.05D : -0.05D,
                    0.02D,
                    0.0D
            );
        }
    }

    private static void spawnArrowHit(ClientLevel level, Vec3 pos) {
        for (int i = 0; i < 7; i++) {
            level.addAlwaysVisibleParticle(
                    i % 2 == 0 ? ParticleTypes.CRIT : ParticleTypes.POOF,
                    pos.x + ((level.random.nextDouble() - 0.5D) * 0.45D),
                    pos.y + ((level.random.nextDouble() - 0.5D) * 0.45D),
                    pos.z + ((level.random.nextDouble() - 0.5D) * 0.45D),
                    0.0D,
                    0.01D,
                    0.0D
            );
        }
    }

    private static ItemStack dyedLeather(ItemStack stack, int color) {
        stack.set(DataComponents.DYED_COLOR, new DyedItemColor(color));
        return stack;
    }

    private static boolean isDangerous(ClientLevel level, Vec3 pos) {
        BlockPos feet = BlockPos.containing(pos.x, pos.y, pos.z);
        return level.getBlockState(feet).is(Blocks.LAVA)
                || level.getBlockState(feet).is(Blocks.FIRE)
                || level.getBlockState(feet).is(Blocks.SOUL_FIRE)
                || level.getBlockState(feet.below()).is(Blocks.LAVA)
                || level.getBlockState(feet.below()).is(Blocks.FIRE)
                || level.getBlockState(feet.below()).is(Blocks.SOUL_FIRE);
    }

    private static boolean isWater(ClientLevel level, Vec3 pos) {
        BlockPos feet = BlockPos.containing(pos.x, pos.y, pos.z);
        return level.getBlockState(feet).is(Blocks.WATER) || level.getBlockState(feet.below()).is(Blocks.WATER);
    }

    private static Vec3 orientedPosition(double sideOffset, double forwardOffset) {
        return sceneAnchor.add(sceneRight.scale(sideOffset)).add(sceneForward.scale(forwardOffset));
    }

    private static Vec3 sameHeightPosition(double sideOffset, double forwardOffset) {
        Vec3 position = orientedPosition(sideOffset, forwardOffset);
        return new Vec3(position.x, sceneAnchor.y, position.z);
    }

    private static Vec3 snapToGround(ClientLevel level, Vec3 anchor, Vec3 desired) {
        int probeY = Mth.floor(Math.max(anchor.y + 4.0D, desired.y + 4.0D));
        BlockPos probe = BlockPos.containing(desired.x, probeY, desired.z);
        BlockPos surface = level.getHeightmapPos(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, probe);
        double groundY = surface.getY() + 1.0D;
        if (Math.abs(groundY - anchor.y) > MAX_HEIGHT_DELTA) {
            groundY = anchor.y;
        }
        return new Vec3(desired.x, groundY, desired.z);
    }

    private static void teleportEntity(Entity entity, Vec3 target, Vec3 lookAt) {
        float yaw = lookYaw(target, lookAt);
        entity.teleportTo(target.x, target.y, target.z);
        entity.setPos(target.x, target.y, target.z);
        entity.setOldPosAndRot(target, yaw, 0.0F);
        entity.setDeltaMovement(Vec3.ZERO);
        entity.resetFallDistance();
        entity.setXRot(0.0F);
        entity.setYRot(yaw);
        entity.setYBodyRot(yaw);
        entity.setYHeadRot(yaw);
    }

    private static Vec3 forwardVector(float yaw) {
        double radians = Math.toRadians(yaw);
        return new Vec3(-Math.sin(radians), 0.0D, Math.cos(radians)).normalize();
    }

    private static float lookYaw(Vec3 from, Vec3 to) {
        return (float) (Math.toDegrees(Math.atan2(to.z - from.z, to.x - from.x)) - 90.0D);
    }

    private static double laneOffset(Soldier soldier) {
        return switch (soldier.localIndex) {
            case 0 -> -8.8D;
            case 1 -> -5.9D;
            case 2 -> -2.9D;
            case 3 -> -0.7D;
            case 4 -> 1.6D;
            case 5 -> 4.4D;
            case 6 -> 7.2D;
            default -> 10.0D;
        };
    }

    private static boolean isActiveSoldier(Soldier soldier) {
        return soldier.localIndex < SETTINGS.soldiersPerTeam;
    }

    private static Soldier enemyFor(Soldier soldier) {
        int enemyLocalIndex = soldier.localIndex % SETTINGS.soldiersPerTeam;
        int enemyIndex = soldier.team == Team.BLUE ? 8 + enemyLocalIndex : enemyLocalIndex;
        return SOLDIERS.get(enemyIndex);
    }

    private static BattleSceneSettings.TeamSpawn fixedSpawn(Team team) {
        return team == Team.BLUE ? SETTINGS.blueSpawn : SETTINGS.redSpawn;
    }

    private static Role currentRole(Soldier soldier) {
        return switch (SETTINGS.composition) {
            case ARCHERS -> Role.ARCHER;
            case MELEE -> soldier.localIndex % 3 == 0 ? Role.BERSERKER : Role.SWORD;
            case SHIELDS -> soldier.localIndex < 3 ? Role.SHIELD : (soldier.localIndex == 5 ? Role.ARCHER : Role.SWORD);
            case MIXED -> soldier.role;
        };
    }

    private static boolean currentHasShield(Soldier soldier) {
        Role role = currentRole(soldier);
        return role == Role.SHIELD || (SETTINGS.composition == BattleSceneSettings.Composition.MIXED && soldier.hasShield);
    }

    private static UUID syntheticUuid(String scope, int localId) {
        return UUID.nameUUIDFromBytes(("battle-scene-" + scope + ":" + localId).getBytes(StandardCharsets.UTF_8));
    }

    private static List<Soldier> createSoldiers() {
        List<Soldier> soldiers = new ArrayList<>(16);
        BattleActorPlayer.BattleProfile[] blue = {
                BattleActorPlayer.BattleProfile.online("Technoblade", "b876ec32e396476ba1158438d83c67d4"),
                BattleActorPlayer.BattleProfile.online("Dream", "ec70bcaf702f4bb8b48d276fa52a780c"),
                BattleActorPlayer.BattleProfile.online("Sapnap", "c66f7c8aed0c446990b0421d8ff7ca49"),
                BattleActorPlayer.BattleProfile.online("GeorgeNotFound", "bd3dd5a404384699b2fd36f518154b41"),
                BattleActorPlayer.BattleProfile.online("TommyInnit", "e80e8194323e414298515e1bcb8a3508"),
                BattleActorPlayer.BattleProfile.online("Tubbo", "b25efb42bda644138da94eae3d345746"),
                BattleActorPlayer.BattleProfile.online("PhilzA", "f327197be9dd449182cd6cef1d59346e"),
                BattleActorPlayer.BattleProfile.online("BadBoyHalo", "26bdff37fec848f1980f66bf69ee751c")
        };
        BattleActorPlayer.BattleProfile[] red = {
                BattleActorPlayer.BattleProfile.online("CaptainSparklez", "5f820c3958834392b1743125ac05e38c"),
                BattleActorPlayer.BattleProfile.online("EthosLab", "4f41dcda449a46b7863588979061fdd2"),
                BattleActorPlayer.BattleProfile.online("BdoubleO100", "7163fbce39ac4a02b836a991c45d2dd1"),
                BattleActorPlayer.BattleProfile.online("Grian", "5f8eb73b25be4c5aa50fd27d65e30ca0"),
                BattleActorPlayer.BattleProfile.online("MumboJumbo", "c7da90d56a054217b94a7d427cbbcad8"),
                BattleActorPlayer.BattleProfile.online("impulseSV", "f6fe2200609d4fe688b6529d59ee5b71"),
                BattleActorPlayer.BattleProfile.online("Smallishbeans", "69b3107a6d034122b5677652fcc3cdb2"),
                BattleActorPlayer.BattleProfile.online("iskall85", "7ed3587be656468990d608e11daaf907")
        };
        Role[] roles = {Role.SHIELD, Role.SWORD, Role.ARCHER, Role.BERSERKER, Role.SHIELD, Role.ARCHER, Role.SWORD, Role.BERSERKER};
        for (int i = 0; i < 8; i++) {
            soldiers.add(new Soldier(i, i, Team.BLUE, roles[i], blue[i]));
        }
        for (int i = 0; i < 8; i++) {
            soldiers.add(new Soldier(8 + i, i, Team.RED, roles[7 - i], red[i]));
        }
        return soldiers;
    }

    enum Team {
        BLUE,
        RED
    }

    private enum Role {
        SHIELD,
        SWORD,
        ARCHER,
        BERSERKER
    }

    private static final class Soldier {
        private final int index;
        private final int localIndex;
        private final Team team;
        private final Role role;
        private final boolean hasShield;
        private final BattleActorPlayer.BattleProfile profile;
        private BattleActorPlayer actor;
        private int decisionTicks;
        private int attackCooldown;
        private int guardTicks;
        private int drawTicks;
        private int repositionTicks;
        private int pathTicks;
        private int hazardTicks;
        private double orbitDirection;
        private double flankBias;
        private double pathSide;
        private double pressure;

        private Soldier(int index, int localIndex, Team team, Role role, BattleActorPlayer.BattleProfile profile) {
            this.index = index;
            this.localIndex = localIndex;
            this.team = team;
            this.role = role;
            this.profile = profile;
            this.hasShield = role == Role.SHIELD || localIndex == 1 || localIndex == 5;
        }

        private void prepare() {
            reset();
            decisionTicks = 6 + index * 3;
            attackCooldown = 10 + index * 2;
            orbitDirection = (index & 1) == 0 ? 1.0D : -1.0D;
            flankBias = (localIndex - 3.5D) * 0.35D;
            pressure = 1.0D;
        }

        private void reset() {
            decisionTicks = 0;
            attackCooldown = 0;
            guardTicks = 0;
            drawTicks = 0;
            repositionTicks = 0;
            pathTicks = 0;
            hazardTicks = 0;
            orbitDirection = 1.0D;
            flankBias = 0.0D;
            pathSide = 0.0D;
            pressure = 1.0D;
        }
    }
}
