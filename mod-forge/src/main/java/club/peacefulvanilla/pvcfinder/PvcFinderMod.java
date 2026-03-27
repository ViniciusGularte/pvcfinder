package club.peacefulvanilla.pvcfinder;

import club.peacefulvanilla.pvcfinder.client.PvcFinderClient;
import net.minecraftforge.fml.common.Mod;

@Mod(PvcFinderMod.MOD_ID)
public final class PvcFinderMod {
    public static final String MOD_ID = "pvcfinder";

    public PvcFinderMod() {
        PvcFinderClient.bootstrap();
    }
}
