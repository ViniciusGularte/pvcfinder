package club.peacefulvanilla.battlescene.client;

import com.mojang.authlib.GameProfile;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.RemotePlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.PlayerSkin;

import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.function.Supplier;

final class BattleActorPlayer extends RemotePlayer {
    private volatile Supplier<PlayerSkin> skinSupplier;

    BattleActorPlayer(ClientLevel level, BattleProfile profile) {
        super(level, new GameProfile(profile.profileId(), profile.name()));
        skinSupplier = createSkinSupplier(profile);
        noPhysics = false;
        setInvulnerable(true);
        setNoGravity(false);
        setSilent(true);
    }

    @Override
    public PlayerSkin getSkin() {
        return skinSupplier.get();
    }

    @Override
    public boolean shouldShowName() {
        return false;
    }

    @Override
    public boolean isPushable() {
        return false;
    }

    @Override
    public boolean isPickable() {
        return false;
    }

    @Override
    public boolean canCollideWith(Entity entity) {
        return false;
    }

    @Override
    public boolean canBeCollidedWith(Entity entity) {
        return false;
    }

    private Supplier<PlayerSkin> createSkinSupplier(BattleProfile profile) {
        Minecraft minecraft = Minecraft.getInstance();
        GameProfile fallbackProfile = new GameProfile(profile.profileId(), profile.name());
        Supplier<PlayerSkin> fallbackLookup = minecraft.getSkinManager().createLookup(fallbackProfile, false);
        CompletableFuture
                .supplyAsync(() -> resolveOnlineProfile(minecraft, profile).orElse(fallbackProfile))
                .thenAccept(resolvedProfile ->
                        skinSupplier = minecraft.getSkinManager().createLookup(resolvedProfile, false)
                );
        return fallbackLookup;
    }

    private Optional<GameProfile> resolveOnlineProfile(Minecraft minecraft, BattleProfile profile) {
        try {
            if (profile.onlineId() != null) {
                return minecraft.services().profileResolver().fetchById(profile.onlineId());
            }
            return minecraft.services().profileResolver().fetchByName(profile.name());
        } catch (RuntimeException ignored) {
            return Optional.empty();
        }
    }

    record BattleProfile(String name, UUID profileId, UUID entityId, UUID onlineId) {
        static BattleProfile online(String name) {
            return new BattleProfile(name, syntheticId("profile", name), syntheticId("entity", name), null);
        }

        static BattleProfile online(String name, String onlineId) {
            UUID id = dashedUuid(onlineId);
            return new BattleProfile(name, id, syntheticId("entity", name), id);
        }

        private static UUID syntheticId(String scope, String name) {
            return UUID.nameUUIDFromBytes(("battle-scene-" + scope + ":" + name).getBytes(StandardCharsets.UTF_8));
        }

        private static UUID dashedUuid(String value) {
            return UUID.fromString(value.replaceFirst(
                    "(\\p{XDigit}{8})(\\p{XDigit}{4})(\\p{XDigit}{4})(\\p{XDigit}{4})(\\p{XDigit}+)",
                    "$1-$2-$3-$4-$5"
            ));
        }
    }
}
