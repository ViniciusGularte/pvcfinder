package club.peacefulvanilla.battlescene.client;

import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

final class BattleSceneSettings {
    static final BattleSceneSettings INSTANCE = new BattleSceneSettings();

    private static final int PRESET_COUNT = 5;
    private final Path presetFile = FabricLoader.getInstance().getConfigDir().resolve("battlescene-presets.properties");

    int soldiersPerTeam = 8;
    double spread = 1.0D;
    Composition composition = Composition.MIXED;
    int presetSlot = 1;
    TeamSpawn blueSpawn;
    TeamSpawn redSpawn;

    private BattleSceneSettings() {
    }

    void cycleSoldiers() {
        soldiersPerTeam = soldiersPerTeam >= 8 ? 2 : soldiersPerTeam + 2;
    }

    void cycleSpread() {
        if (spread < 0.85D) {
            spread = 1.0D;
        } else if (spread < 1.15D) {
            spread = 1.35D;
        } else {
            spread = 0.7D;
        }
    }

    void cycleComposition() {
        composition = composition.next();
    }

    void cyclePresetSlot() {
        presetSlot = presetSlot >= PRESET_COUNT ? 1 : presetSlot + 1;
    }

    boolean savePreset() {
        Properties properties = readPresets();
        String prefix = "preset." + presetSlot + ".";
        properties.setProperty(prefix + "soldiers", Integer.toString(soldiersPerTeam));
        properties.setProperty(prefix + "spread", Double.toString(spread));
        properties.setProperty(prefix + "composition", composition.name());
        try {
            Files.createDirectories(presetFile.getParent());
            try (Writer writer = Files.newBufferedWriter(presetFile)) {
                properties.store(writer, "Battle Scene troop presets");
            }
            return true;
        } catch (IOException ignored) {
            return false;
        }
    }

    boolean loadPreset() {
        Properties properties = readPresets();
        String prefix = "preset." + presetSlot + ".";
        String soldiers = properties.getProperty(prefix + "soldiers");
        String spreadValue = properties.getProperty(prefix + "spread");
        String compositionValue = properties.getProperty(prefix + "composition");
        if (soldiers == null || spreadValue == null || compositionValue == null) {
            return false;
        }
        try {
            soldiersPerTeam = clamp(Integer.parseInt(soldiers), 2, 8);
            if ((soldiersPerTeam & 1) == 1) {
                soldiersPerTeam--;
            }
            spread = Math.max(0.7D, Math.min(1.35D, Double.parseDouble(spreadValue)));
            composition = Composition.valueOf(compositionValue);
            return true;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private Properties readPresets() {
        Properties properties = new Properties();
        if (!Files.isRegularFile(presetFile)) {
            return properties;
        }
        try (Reader reader = Files.newBufferedReader(presetFile)) {
            properties.load(reader);
        } catch (IOException ignored) {
            return new Properties();
        }
        return properties;
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    boolean fixSpawn(Minecraft minecraft, BattleSceneController.Team team) {
        if (minecraft.level == null || minecraft.player == null) {
            return false;
        }
        LocalPlayer player = minecraft.player;
        TeamSpawn spawn = new TeamSpawn(player.position(), player.getYRot(), minecraft.level.dimension());
        if (team == BattleSceneController.Team.BLUE) {
            blueSpawn = spawn;
        } else {
            redSpawn = spawn;
        }
        return true;
    }

    void clearFixedSpawns() {
        blueSpawn = null;
        redSpawn = null;
    }

    String soldiersLabel() {
        return soldiersPerTeam + " vs " + soldiersPerTeam;
    }

    String spreadLabel() {
        if (spread < 0.85D) {
            return "Agrupado";
        }
        if (spread < 1.15D) {
            return "Medio";
        }
        return "Espalhado";
    }

    record TeamSpawn(Vec3 position, float yaw, ResourceKey<Level> dimension) {
    }

    enum Composition {
        MIXED("Misto"),
        MELEE("So melee"),
        ARCHERS("So arqueiros"),
        SHIELDS("Escudos");

        private final String label;

        Composition(String label) {
            this.label = label;
        }

        String label() {
            return label;
        }

        Composition next() {
            Composition[] values = values();
            return values[(ordinal() + 1) % values.length];
        }
    }
}
