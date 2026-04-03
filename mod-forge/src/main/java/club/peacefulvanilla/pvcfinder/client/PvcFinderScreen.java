package club.peacefulvanilla.pvcfinder.client;

import club.peacefulvanilla.pvcfinder.data.PvcOffer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.ContainerObjectSelectionList;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.narration.NarratableEntry;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import net.minecraft.world.item.ItemStack;

import java.util.List;

public final class PvcFinderScreen extends Screen {
    private static final int TRACK_BUTTON_WIDTH = 72;
    private static final int CONTENTS_BUTTON_WIDTH = 78;
    private static final int ACTION_BUTTON_HEIGHT = 20;

    private final PvcFinderDataStore dataStore;
    private EditBox searchBox;
    private OfferList offerList;
    private Button jesusButton;
    private Button nukeButton;
    private PvcOffer activeContentsOffer;
    private int contentsScrollOffset;

    public PvcFinderScreen(PvcFinderDataStore dataStore) {
        super(Component.translatable("screen.pvcfinder.title"));
        this.dataStore = dataStore;
    }

    @Override
    protected void init() {
        dataStore.ensureLoaded(minecraft);

        int contentWidth = Math.min(width - 32, 420);
        int left = (width - contentWidth) / 2;

        searchBox = new EditBox(font, left, 34, contentWidth, 20, Component.translatable("screen.pvcfinder.search"));
        searchBox.setMaxLength(120);
        searchBox.setResponder(value -> refreshList());
        addRenderableWidget(searchBox);

        int panelWidth = Math.min(width - 20, 460);
        int panelLeft = (width - panelWidth) / 2;
        jesusButton = addRenderableWidget(Button.builder(Component.translatable(jesusButtonTranslationKey()), button -> {
            PvcFinderClient.toggleImaginaryFriend(minecraft);
            button.setMessage(Component.translatable(jesusButtonTranslationKey()));
        }).bounds(panelLeft + panelWidth - 194, 14, 90, 20).build());
        nukeButton = addRenderableWidget(Button.builder(Component.translatable("screen.pvcfinder.send_nuke"), button -> {
            PvcFinderClient.triggerTrackedNuke(minecraft);
            refreshList();
        }).bounds(panelLeft + panelWidth - 96, 14, 88, 20).build());

        offerList = addRenderableWidget(new OfferList(
                minecraft,
                width,
                height - 90,
                62,
                76
        ));

        setInitialFocus(searchBox);
        refreshList();
    }

    @Override
    public void resize(Minecraft minecraft, int width, int height) {
        String previous = searchBox == null ? "" : searchBox.getValue();
        super.resize(minecraft, width, height);
        if (searchBox != null) {
            searchBox.setValue(previous);
        }
    }

    @Override
    public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
        if (activeContentsOffer != null) {
            return handleContentsOverlayClick(event.x(), event.y(), event.button());
        }
        return super.mouseClicked(event, doubleClick);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
        if (activeContentsOffer != null) {
            return handleContentsOverlayScroll(mouseX, mouseY, scrollY);
        }
        return super.mouseScrolled(mouseX, mouseY, scrollX, scrollY);
    }

    @Override
    public boolean keyPressed(net.minecraft.client.input.KeyEvent event) {
        if (activeContentsOffer != null && event.key() == 256) {
            closeContentsPreview();
            return true;
        }
        return super.keyPressed(event);
    }

    @Override
    public void render(GuiGraphics guiGraphics, int mouseX, int mouseY, float partialTick) {
        renderBackground(guiGraphics, mouseX, mouseY, partialTick);

        int panelWidth = Math.min(width - 20, 460);
        int left = (width - panelWidth) / 2;
        int right = left + panelWidth;
        guiGraphics.fill(left - 8, 12, right + 8, height - 12, 0xC0101010);
        guiGraphics.fill(left - 8, 12, right + 8, 13, 0xFF5FBF4A);

        guiGraphics.drawString(font, title, left, 18, 0xF0F0F0, false);
        guiGraphics.drawString(
                font,
                Component.translatable("screen.pvcfinder.subtitle", dataStore.offerCount(), dataStore.dumpedAt()),
                left,
                48,
                0xB8B8B8,
                false
        );

        super.render(guiGraphics, mouseX, mouseY, partialTick);
        if (activeContentsOffer != null) {
            renderContentsOverlay(guiGraphics, mouseX, mouseY);
        }
        ClientNukeEffect.renderOverlay(minecraft, guiGraphics);

        int footerY = height - 20;
        if (dataStore.errorMessage() != null) {
            guiGraphics.drawCenteredString(font, Component.translatable("screen.pvcfinder.error", dataStore.errorMessage()), width / 2, footerY, 0xFF7070);
        } else if (offerList != null && offerList.entryCount() == 0) {
            guiGraphics.drawCenteredString(font, Component.translatable("screen.pvcfinder.empty"), width / 2, footerY, 0xC0C0C0);
        } else {
            guiGraphics.drawCenteredString(font, PvcFinderClient.trackingStatus(minecraft), width / 2, footerY, 0x8FE388);
        }
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }

    private String jesusButtonTranslationKey() {
        return PvcFinderClient.isImaginaryFriendActive()
                ? "screen.pvcfinder.hide_jesus"
                : "screen.pvcfinder.spawn_jesus";
    }

    private void refreshList() {
        if (offerList == null) {
            return;
        }

        List<OfferEntry> entries = dataStore.filterOffers(searchBox == null ? "" : searchBox.getValue().trim())
                .stream()
                .map(OfferEntry::new)
                .toList();
        offerList.replaceEntries(entries);
    }

    private void openContentsPreview(PvcOffer offer) {
        activeContentsOffer = offer;
        contentsScrollOffset = 0;
    }

    private void closeContentsPreview() {
        activeContentsOffer = null;
        contentsScrollOffset = 0;
    }

    private void renderContentsOverlay(GuiGraphics guiGraphics, int mouseX, int mouseY) {
        int modalLeft = contentsModalLeft();
        int modalTop = contentsModalTop();
        int modalRight = modalLeft + contentsModalWidth();
        int modalBottom = modalTop + contentsModalHeight();
        int bodyLeft = contentsBodyLeft();
        int bodyTop = contentsBodyTop();
        int bodyRight = contentsBodyRight();
        int bodyBottom = contentsBodyBottom();

        guiGraphics.fill(0, 0, width, height, 0xAA000000);
        guiGraphics.fill(modalLeft, modalTop, modalRight, modalBottom, 0xF0101010);
        guiGraphics.fill(modalLeft, modalTop, modalRight, modalTop + 2, 0xFF5FBF4A);
        guiGraphics.drawString(font, Component.translatable("screen.pvcfinder.contents"), modalLeft + 12, modalTop + 12, 0xF4F4F4, false);
        drawTrimmed(guiGraphics, activeContentsOffer.title(), modalLeft + 12, modalTop + 26, contentsModalWidth() - 96, 0xB8B8B8);

        int closeWidth = font.width(Component.translatable("screen.pvcfinder.close")) + 16;
        int closeX = modalRight - closeWidth - 12;
        int closeY = modalTop + 10;
        guiGraphics.fill(closeX, closeY, closeX + closeWidth, closeY + 18, 0x80202020);
        guiGraphics.fill(closeX, closeY, closeX + closeWidth, closeY + 1, 0xFF5FBF4A);
        guiGraphics.drawCenteredString(font, Component.translatable("screen.pvcfinder.close"), closeX + (closeWidth / 2), closeY + 5, 0xF4F4F4);

        guiGraphics.fill(bodyLeft, bodyTop, bodyRight, bodyBottom, 0xA0181818);
        guiGraphics.fill(bodyLeft, bodyTop, bodyRight, bodyTop + 2, 0xFF9AD88D);
        guiGraphics.drawString(font, "Trade preview", bodyLeft + 10, bodyTop + 8, 0xC0C0C0, false);

        List<String> lines = activeContentsOffer.previewContents();
        int visibleLines = contentsVisibleLines();
        int fromIndex = Mth.clamp(contentsScrollOffset, 0, contentsMaxScroll());
        int toIndex = Math.min(lines.size(), fromIndex + visibleLines);
        int y = bodyTop + 26;
        for (int index = fromIndex; index < toIndex; index++) {
            String line = lines.get(index);
            if (!line.isBlank() && ((index - fromIndex) & 1) == 0) {
                guiGraphics.fill(bodyLeft + 6, y - 1, bodyRight - 14, y + 11, 0x18000000);
            }
            if (!line.isBlank()) {
                boolean sectionLine = !line.startsWith("  ");
                drawTrimmed(guiGraphics, line.stripLeading(), bodyLeft + 10, y, bodyRight - bodyLeft - 28, sectionLine ? 0xFFF6D27A : 0xE0E0E0);
            }
            y += 12;
        }

        renderContentsScrollbar(guiGraphics, lines.size(), visibleLines, fromIndex, bodyRight - 8, bodyTop + 24, bodyBottom - 12);
    }

    private void renderContentsScrollbar(GuiGraphics guiGraphics, int totalLines, int visibleLines, int offset, int x, int top, int bottom) {
        guiGraphics.fill(x, top, x + 4, bottom, 0x33000000);
        if (totalLines <= visibleLines) {
            guiGraphics.fill(x, top, x + 4, bottom, 0xFF5FBF4A);
            return;
        }

        int trackHeight = Math.max(16, bottom - top);
        int thumbHeight = Math.max(14, Mth.floor((visibleLines / (float) totalLines) * trackHeight));
        int maxOffset = Math.max(1, totalLines - visibleLines);
        int thumbTravel = Math.max(1, trackHeight - thumbHeight);
        int thumbTop = top + Mth.floor((offset / (float) maxOffset) * thumbTravel);
        guiGraphics.fill(x, thumbTop, x + 4, thumbTop + thumbHeight, 0xFF5FBF4A);
    }

    private boolean handleContentsOverlayClick(double mouseX, double mouseY, int button) {
        if (button != 0) {
            return true;
        }

        if (!isInside(mouseX, mouseY, contentsModalLeft(), contentsModalTop(), contentsModalWidth(), contentsModalHeight())) {
            closeContentsPreview();
            return true;
        }

        int closeWidth = font.width(Component.translatable("screen.pvcfinder.close")) + 16;
        int closeX = contentsModalLeft() + contentsModalWidth() - closeWidth - 12;
        int closeY = contentsModalTop() + 10;
        if (isInside(mouseX, mouseY, closeX, closeY, closeWidth, 18)) {
            closeContentsPreview();
        }
        return true;
    }

    private boolean handleContentsOverlayScroll(double mouseX, double mouseY, double scrollY) {
        if (activeContentsOffer == null) {
            return false;
        }
        if (!isInside(mouseX, mouseY, contentsBodyLeft(), contentsBodyTop(), contentsBodyRight() - contentsBodyLeft(), contentsBodyBottom() - contentsBodyTop())) {
            return true;
        }

        int direction = scrollY > 0 ? -1 : (scrollY < 0 ? 1 : 0);
        if (direction == 0) {
            return true;
        }
        contentsScrollOffset = Mth.clamp(contentsScrollOffset + direction, 0, contentsMaxScroll());
        return true;
    }

    private int contentsModalWidth() {
        return 320;
    }

    private int contentsModalHeight() {
        return 206;
    }

    private int contentsModalLeft() {
        return (width / 2) - (contentsModalWidth() / 2);
    }

    private int contentsModalTop() {
        return (height / 2) - (contentsModalHeight() / 2);
    }

    private int contentsBodyLeft() {
        return contentsModalLeft() + 12;
    }

    private int contentsBodyTop() {
        return contentsModalTop() + 44;
    }

    private int contentsBodyRight() {
        return contentsModalLeft() + contentsModalWidth() - 12;
    }

    private int contentsBodyBottom() {
        return contentsModalTop() + contentsModalHeight() - 12;
    }

    private int contentsVisibleLines() {
        return Math.max(1, (contentsBodyBottom() - (contentsBodyTop() + 18)) / 12);
    }

    private int contentsMaxScroll() {
        if (activeContentsOffer == null) {
            return 0;
        }
        return Math.max(0, activeContentsOffer.previewContents().size() - contentsVisibleLines());
    }

    private void drawTrimmed(GuiGraphics guiGraphics, String text, int x, int y, int maxWidth, int color) {
        guiGraphics.drawString(font, font.plainSubstrByWidth(text, Math.max(maxWidth, 30)), x, y, color, false);
    }

    private boolean isInside(double mouseX, double mouseY, int left, int top, int width, int height) {
        return mouseX >= left && mouseX <= left + width && mouseY >= top && mouseY <= top + height;
    }

    private final class OfferList extends ContainerObjectSelectionList<OfferEntry> {
        private OfferList(Minecraft minecraft, int width, int height, int y0, int itemHeight) {
            super(minecraft, width, height, y0, itemHeight);
        }

        @Override
        public int getRowWidth() {
            return Math.min(PvcFinderScreen.this.width - 48, 420);
        }

        @Override
        protected int scrollBarX() {
            return (PvcFinderScreen.this.width + getRowWidth()) / 2 + 10;
        }

        private int entryCount() {
            return children().size();
        }
    }

    private final class OfferEntry extends ContainerObjectSelectionList.Entry<OfferEntry> {
        private final PvcOffer offer;
        private final Button trackButton;
        private final Button contentsButton;

        private OfferEntry(PvcOffer offer) {
            this.offer = offer;
            this.trackButton = Button.builder(Component.translatable("screen.pvcfinder.track"), button -> {
                PvcFinderClient.toggleTracking(minecraft, offer);
                button.setMessage(trackLabel());
            }).bounds(0, 0, TRACK_BUTTON_WIDTH, ACTION_BUTTON_HEIGHT).build();
            this.contentsButton = offer.hasPreviewContents()
                    ? Button.builder(Component.translatable("screen.pvcfinder.contents"), button -> openContentsPreview(offer))
                    .bounds(0, 0, CONTENTS_BUTTON_WIDTH, ACTION_BUTTON_HEIGHT)
                    .build()
                    : null;
        }

        @Override
        public void renderContent(GuiGraphics guiGraphics, int mouseX, int mouseY, boolean hovered, float partialTick) {
            int left = getX();
            int top = getY();
            int width = getWidth();
            int height = getHeight();
            int background = hovered ? 0x90303330 : 0x70202020;
            guiGraphics.fill(left, top, left + width, top + height - 2, background);
            guiGraphics.fill(left, top, left + width, top + 1, 0xFF5FBF4A);

            ItemStack stack = offer.resultItem().toItemStack();
            guiGraphics.renderItem(stack, left + 8, top + 8);

            int textLeft = left + 32;
            int buttonColumnWidth = contentsButton == null ? TRACK_BUTTON_WIDTH + 12 : CONTENTS_BUTTON_WIDTH + 12;
            int textRight = left + width - buttonColumnWidth - 14;
            drawTrimmed(guiGraphics, offer.title(), textLeft, top + 7, textRight - textLeft, 0xF4F4F4);
            drawTrimmed(guiGraphics, offer.priceLabel(), textLeft, top + 20, textRight - textLeft, 0xD0D0D0);
            drawTrimmed(
                    guiGraphics,
                    offer.shop().displayName() + " | " + offer.shop().displayOwner() + " | " + offer.shop().coordsLabel(),
                    textLeft,
                    top + 33,
                    textRight - textLeft,
                    0xB2D8B2
            );
            drawTrimmed(
                    guiGraphics,
                    offer.stockLabel() + " | " + offer.shop().dimensionLabel(),
                    textLeft,
                    top + 45,
                    textRight - textLeft,
                    offer.stock() > 0 ? 0x8FE388 : 0xF08A8A
            );

            int buttonX = left + width - buttonColumnWidth;
            if (contentsButton != null) {
                contentsButton.setX(buttonX);
                contentsButton.setY(top + 10);
                contentsButton.render(guiGraphics, mouseX, mouseY, partialTick);
                trackButton.setX(buttonX + Mth.floor((CONTENTS_BUTTON_WIDTH - TRACK_BUTTON_WIDTH) / 2.0F));
                trackButton.setY(top + 42);
            } else {
                trackButton.setX(buttonX);
                trackButton.setY(top + Mth.floor((height - ACTION_BUTTON_HEIGHT) / 2.0F));
            }
            trackButton.setMessage(trackLabel());
            trackButton.render(guiGraphics, mouseX, mouseY, partialTick);
        }

        @Override
        public List<? extends GuiEventListener> children() {
            return contentsButton == null ? List.of(trackButton) : List.of(trackButton, contentsButton);
        }

        @Override
        public List<? extends NarratableEntry> narratables() {
            return contentsButton == null ? List.of(trackButton) : List.of(trackButton, contentsButton);
        }

        private Component trackLabel() {
            return PvcFinderClient.isTracked(offer)
                    ? Component.translatable("screen.pvcfinder.tracking")
                    : Component.translatable("screen.pvcfinder.track");
        }
    }
}
