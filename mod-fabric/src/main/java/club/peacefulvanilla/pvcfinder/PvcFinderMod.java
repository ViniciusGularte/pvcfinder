package club.peacefulvanilla.pvcfinder;

import club.peacefulvanilla.pvcfinder.client.PvcFinderClient;
import net.fabricmc.api.ClientModInitializer;

public final class PvcFinderMod implements ClientModInitializer {
    public static final String MOD_ID = "pvcfinder";

    @Override
    public void onInitializeClient() {
        PvcFinderClient.bootstrap();
    }
}
