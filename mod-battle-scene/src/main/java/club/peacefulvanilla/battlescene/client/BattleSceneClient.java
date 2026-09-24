package club.peacefulvanilla.battlescene.client;

import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;

public final class BattleSceneClient {
    private static final int HOLD_MENU_TICKS = 12;
    private static final KeyMapping TOGGLE_BATTLE_KEY = new KeyMapping(
            "key.battlescene.toggle",
            InputConstants.Type.KEYSYM,
            InputConstants.KEY_J,
            KeyMapping.Category.MISC
    );
    private static boolean bootstrapped;
    private static int keyHeldTicks;
    private static boolean menuOpenedForPress;

    private BattleSceneClient() {
    }

    public static void bootstrap() {
        if (bootstrapped) {
            return;
        }
        bootstrapped = true;
        KeyBindingHelper.registerKeyBinding(TOGGLE_BATTLE_KEY);
        ClientTickEvents.END_CLIENT_TICK.register(BattleSceneClient::onClientTick);
    }

    private static void onClientTick(Minecraft minecraft) {
        if (minecraft.screen == null && TOGGLE_BATTLE_KEY.isDown()) {
            keyHeldTicks++;
            if (!menuOpenedForPress && keyHeldTicks >= HOLD_MENU_TICKS) {
                menuOpenedForPress = true;
                minecraft.setScreen(new BattleSceneConfigScreen());
            }
        } else {
            if (keyHeldTicks > 0 && keyHeldTicks < HOLD_MENU_TICKS && !menuOpenedForPress) {
                BattleSceneController.toggle(minecraft);
            }
            keyHeldTicks = 0;
            menuOpenedForPress = false;
        }

        while (TOGGLE_BATTLE_KEY.consumeClick()) {
            // Drains Fabric's click queue; short/long press is handled above.
        }
        BattleSceneController.tick(minecraft);
    }
}
