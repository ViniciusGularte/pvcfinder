package club.peacefulvanilla.pvcfinder.client;

import club.peacefulvanilla.pvcfinder.PvcFinderMod;
import com.mojang.authlib.GameProfile;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.ClientAsset;
import net.minecraft.client.player.RemotePlayer;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.PlayerModelType;
import net.minecraft.world.entity.player.PlayerSkin;

import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.function.Supplier;
import java.util.UUID;

final class ImaginaryFriendPlayer extends RemotePlayer {
    private static final ResourceLocation JESUS_SKIN_TEXTURE =
            ResourceLocation.fromNamespaceAndPath(PvcFinderMod.MOD_ID, "textures/entity/jesus_friend.png");
    private static final ClientAsset.Texture JESUS_SKIN_ASSET = new ClientAsset.Texture() {
        @Override
        public ResourceLocation id() {
            return JESUS_SKIN_TEXTURE;
        }

        @Override
        public ResourceLocation texturePath() {
            return JESUS_SKIN_TEXTURE;
        }
    };
    private static final PlayerSkin JESUS_SKIN =
            PlayerSkin.insecure(JESUS_SKIN_ASSET, null, null, PlayerModelType.WIDE);
    static final PartyProfile JESUS_PROFILE = PartyProfile.local(
            "JesusCraftsPeace",
            UUID.fromString("6ba7f277-6b62-4e06-bcbb-d65fd446854e"),
            JESUS_SKIN
    );

    private volatile Supplier<PlayerSkin> skinSupplier;

    ImaginaryFriendPlayer(ClientLevel level, PartyProfile profile) {
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

    private Supplier<PlayerSkin> createSkinSupplier(PartyProfile profile) {
        if (profile.localSkin() != null) {
            return profile::localSkin;
        }

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

    private Optional<GameProfile> resolveOnlineProfile(Minecraft minecraft, PartyProfile profile) {
        try {
            if (profile.onlineId() != null) {
                return minecraft.services().profileResolver().fetchById(profile.onlineId());
            }
            return minecraft.services().profileResolver().fetchByName(profile.name());
        } catch (RuntimeException ignored) {
            return Optional.empty();
        }
    }

    record PartyProfile(String name, UUID profileId, UUID entityId, UUID onlineId, PlayerSkin localSkin) {
        static PartyProfile local(String name, UUID profileId, PlayerSkin skin) {
            return new PartyProfile(name, profileId, syntheticId("entity", name), null, skin);
        }

        static PartyProfile online(String name) {
            return online(name, null);
        }

        static PartyProfile online(String name, UUID onlineId) {
            UUID profileId = onlineId == null ? syntheticId("profile", name) : onlineId;
            return new PartyProfile(name, profileId, syntheticId("entity", name), onlineId, null);
        }

        private static UUID syntheticId(String scope, String name) {
            return UUID.nameUUIDFromBytes(("pvcfinder-party-" + scope + ":" + name).getBytes(StandardCharsets.UTF_8));
        }
    }
}
