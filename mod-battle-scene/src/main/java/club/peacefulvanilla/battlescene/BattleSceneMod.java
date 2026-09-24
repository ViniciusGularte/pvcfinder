package club.peacefulvanilla.battlescene;

import club.peacefulvanilla.battlescene.client.BattleSceneClient;
import net.fabricmc.api.ClientModInitializer;

public final class BattleSceneMod implements ClientModInitializer {
    public static final String MOD_ID = "battlescene";

    @Override
    public void onInitializeClient() {
        BattleSceneClient.bootstrap();
    }
}
