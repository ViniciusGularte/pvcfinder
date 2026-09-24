package club.peacefulvanilla.battlescene.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

final class BattleSceneConfigScreen extends Screen {
    private static final int PANEL = 0xE6121518;
    private static final int PANEL_TOP = 0xFF2D6CDF;
    private static final int TEXT = 0xFFE8EDF4;
    private static final int MUTED = 0xFFB7C0CC;
    private final BattleSceneSettings settings = BattleSceneSettings.INSTANCE;

    BattleSceneConfigScreen() {
        super(Component.literal("Battle Scene"));
    }

    @Override
    protected void init() {
        int panelWidth = Math.min(380, width - 24);
        int left = (width - panelWidth) / 2;
        int y = Math.max(14, (height - 218) / 2);
        int inner = panelWidth - 24;
        int gap = 6;
        int half = (inner - gap) / 2;
        int third = (inner - gap * 2) / 3;

        addRenderableWidget(Button.builder(Component.literal(BattleSceneController.isActive() ? "Parar batalha" : "Iniciar batalha"), button -> {
            BattleSceneController.toggle(minecraft);
            button.setMessage(Component.literal(BattleSceneController.isActive() ? "Parar batalha" : "Iniciar batalha"));
        }).bounds(left + 12, y + 44, inner, 20).build());

        addRenderableWidget(Button.builder(Component.literal("Soldados: " + settings.soldiersLabel()), button -> {
            settings.cycleSoldiers();
            button.setMessage(Component.literal("Soldados: " + settings.soldiersLabel()));
            BattleSceneController.restartIfActive(minecraft);
        }).bounds(left + 12, y + 76, half, 20).build());

        addRenderableWidget(Button.builder(Component.literal("Espaco: " + settings.spreadLabel()), button -> {
            settings.cycleSpread();
            button.setMessage(Component.literal("Espaco: " + settings.spreadLabel()));
            BattleSceneController.restartIfActive(minecraft);
        }).bounds(left + 12 + half + gap, y + 76, half, 20).build());

        addRenderableWidget(Button.builder(Component.literal("Tipo: " + settings.composition.label()), button -> {
            settings.cycleComposition();
            button.setMessage(Component.literal("Tipo: " + settings.composition.label()));
            BattleSceneController.restartIfActive(minecraft);
        }).bounds(left + 12, y + 104, inner, 20).build());

        addRenderableWidget(Button.builder(Component.literal("Set azul"), button -> {
            if (settings.fixSpawn(minecraft, BattleSceneController.Team.BLUE)) {
                button.setMessage(Component.literal("Azul setado"));
                BattleSceneController.restartIfActive(minecraft);
            }
        }).bounds(left + 12, y + 136, half, 20).build());

        addRenderableWidget(Button.builder(Component.literal("Set vermelho"), button -> {
            if (settings.fixSpawn(minecraft, BattleSceneController.Team.RED)) {
                button.setMessage(Component.literal("Vermelho setado"));
                BattleSceneController.restartIfActive(minecraft);
            }
        }).bounds(left + 12 + half + gap, y + 136, half, 20).build());

        addRenderableWidget(Button.builder(Component.literal("Limpar spawns"), button -> {
            settings.clearFixedSpawns();
            button.setMessage(Component.literal("Spawns limpos"));
            BattleSceneController.restartIfActive(minecraft);
        }).bounds(left + 12, y + 164, inner, 20).build());

        addRenderableWidget(Button.builder(Component.literal("Preset " + settings.presetSlot), button -> {
            settings.cyclePresetSlot();
            button.setMessage(Component.literal("Preset " + settings.presetSlot));
        }).bounds(left + 12, y + 192, third, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Salvar"), button ->
                button.setMessage(Component.literal(settings.savePreset() ? "Salvo" : "Falha"))
        ).bounds(left + 12 + third + gap, y + 192, third, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Carregar"), button -> {
            button.setMessage(Component.literal(settings.loadPreset() ? "Carregado" : "Vazio"));
            BattleSceneController.restartIfActive(minecraft);
            rebuildWidgets();
        }).bounds(left + 12 + (third + gap) * 2, y + 192, third, 20).build());
    }

    @Override
    public void render(GuiGraphics guiGraphics, int mouseX, int mouseY, float partialTick) {
        int panelWidth = Math.min(380, width - 24);
        int left = (width - panelWidth) / 2;
        int y = Math.max(14, (height - 218) / 2);
        int right = left + panelWidth;
        guiGraphics.fill(left, y, right, y + 222, PANEL);
        guiGraphics.fill(left, y, right, y + 3, PANEL_TOP);
        guiGraphics.drawCenteredString(font, title, width / 2, y + 12, TEXT);
        guiGraphics.drawCenteredString(font, Component.literal("Toque J liga/desliga. Segure J configura."), width / 2, y + 27, MUTED);
        super.render(guiGraphics, mouseX, mouseY, partialTick);
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }

    @Override
    public void onClose() {
        Minecraft.getInstance().setScreen(null);
    }
}
