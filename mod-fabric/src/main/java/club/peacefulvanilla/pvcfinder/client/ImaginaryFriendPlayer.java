package club.peacefulvanilla.pvcfinder.client;

import club.peacefulvanilla.pvcfinder.PvcFinderMod;
import com.mojang.authlib.GameProfile;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.ClientAsset;
import net.minecraft.client.player.RemotePlayer;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.PlayerModelType;
import net.minecraft.world.entity.player.PlayerSkin;

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
    static final UUID PROFILE_ID = UUID.fromString("6ba7f277-6b62-4e06-bcbb-d65fd446854e");

    ImaginaryFriendPlayer(ClientLevel level) {
        super(level, new GameProfile(PROFILE_ID, "JesusCraftsPeace"));
        noPhysics = false;
        setInvulnerable(true);
        setNoGravity(false);
        setSilent(true);
    }

    @Override
    public PlayerSkin getSkin() {
        return JESUS_SKIN;
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
}
