package club.peacefulvanilla.pvcfinder.client;

import club.peacefulvanilla.pvcfinder.PvcFinderMod;
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
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import net.minecraft.world.item.ItemStack;

import java.util.Comparator;
import java.util.List;
import java.util.function.Supplier;

public final class PvcFinderScreen extends Screen {
    private static final ResourceLocation LOGO_TEXTURE =
            ResourceLocation.fromNamespaceAndPath(PvcFinderMod.MOD_ID, "textures/gui/pvc_logo.png");
    private static final int LOGO_TEXTURE_WIDTH = 1890;
    private static final int LOGO_TEXTURE_HEIGHT = 1630;
    private static final int COLOR_BACKDROP = 0xD9080604;
    private static final int COLOR_BACKDROP_TOP = 0xCC140D08;
    private static final int COLOR_PANEL = 0xEE0F0B08;
    private static final int COLOR_PANEL_ALT = 0xE61A1209;
    private static final int COLOR_SECTION = 0xCC241810;
    private static final int COLOR_SECTION_SOFT = 0xC616100B;
    private static final int COLOR_BORDER = 0xFF7B4B25;
    private static final int COLOR_ACCENT = 0xFFE8760A;
    private static final int COLOR_ACCENT_DIM = 0xFFB85A00;
    private static final int COLOR_EMERALD = 0xFF4ADE80;
    private static final int COLOR_DIAMOND = 0xFF67E8F9;
    private static final int COLOR_TEXT_BRIGHT = 0xFFF5F0E8;
    private static final int COLOR_TEXT = 0xFFD8CCBC;
    private static final int COLOR_TEXT_MUTED = 0xFFBCAE9C;
    private static final int COLOR_TEXT_GHOST = 0xFF8F7C6B;
    private static final int COLOR_DANGER = 0xFFE35C5C;
    private static final int TRACK_BUTTON_WIDTH = 56;
    private static final int CONTENTS_BUTTON_WIDTH = 62;
    private static final int ACTION_BUTTON_HEIGHT = 20;
    private static final int ACTION_BUTTON_GAP = 8;
    private static final int SUMMARY_PANEL_WIDTH = 150;
    private static final int CHIP_HEIGHT = 18;
    private static final int CHIP_GAP = 6;
    private static final int COMPACT_LAYOUT_WIDTH = 760;
    private static final int FILTER_ROW_PITCH = 24;

    private final PvcFinderDataStore dataStore;
    private EditBox searchBox;
    private OfferList offerList;
    private List<PvcFinderSuggestion> searchSuggestions = List.of();
    private String searchQuery = "";
    private PvcFinderFilters.SortMode sortMode = PvcFinderFilters.SortMode.RELEVANCE;
    private boolean inStockOnly = true;
    private boolean includeShulker = true;
    private PvcFinderFilters.SearchScope searchScope = PvcFinderFilters.SearchScope.ITEM;
    private PvcFinderFilters.TradeIntent tradeIntent = PvcFinderFilters.TradeIntent.BOTH;
    private boolean filtersExpanded;
    private boolean layoutInitialized;
    private PvcOffer activeContentsOffer;
    private int contentsScrollOffset;
    private long observedDataRevision = -1L;

    public PvcFinderScreen(PvcFinderDataStore dataStore) {
        super(Component.translatable("screen.pvcfinder.title"));
        this.dataStore = dataStore;
    }

    @Override
    protected void init() {
        dataStore.ensureLoaded(minecraft);
        observedDataRevision = dataStore.revision();
        if (!layoutInitialized) {
            filtersExpanded = false;
            layoutInitialized = true;
        }

        int left = panelLeft();
        int contentWidth = panelWidth();
        searchBox = new EditBox(font, left + 22, searchBoxY(), contentWidth - 44, 18, Component.translatable("screen.pvcfinder.search"));
        searchBox.setMaxLength(120);
        searchBox.setBordered(false);
        searchBox.setTextColor(COLOR_TEXT_BRIGHT);
        searchBox.setTextColorUneditable(COLOR_TEXT_MUTED);
        searchBox.setValue(searchQuery);
        searchBox.setResponder(value -> {
            searchQuery = value;
            refreshSuggestions();
            refreshList();
        });
        addRenderableWidget(searchBox);

        offerList = addRenderableWidget(new OfferList(
                minecraft,
                width,
                height - 20,
                listStartY(),
                offerRowHeight()
        ));
        setInitialFocus(searchBox);
        refreshList();
    }

    @Override
    public void resize(Minecraft minecraft, int width, int height) {
        searchQuery = searchBox == null ? searchQuery : searchBox.getValue();
        super.resize(minecraft, width, height);
        if (searchBox != null) {
            searchBox.setValue(searchQuery);
        }
    }

    @Override
    public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
        if (activeContentsOffer != null) {
            return handleContentsOverlayClick(event.x(), event.y(), event.button());
        }
        if (event.button() == 0 && focusSearchIfClicked(event.x(), event.y(), event, doubleClick)) {
            return true;
        }
        if (event.button() == 0 && handleSuggestionClick(event.x(), event.y())) {
            return true;
        }
        if (event.button() == 0 && handleHeaderClick(event.x(), event.y())) {
            blurSearchIfNeeded(event.x(), event.y());
            return true;
        }
        blurSearchIfNeeded(event.x(), event.y());
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
        if (dataStore.revision() != observedDataRevision) {
            observedDataRevision = dataStore.revision();
            refreshList();
        }

        guiGraphics.fill(0, 0, width, height, COLOR_BACKDROP);
        guiGraphics.fill(0, 0, width, 58, COLOR_BACKDROP_TOP);
        guiGraphics.fill(0, 58, width, height, 0xC4100C08);

        int left = panelLeft();
        int right = left + panelWidth();
        int searchTop = searchSectionTop();
        guiGraphics.fill(left - 10, 18, right + 10, height - 18, COLOR_PANEL);
        guiGraphics.fill(left - 10, 18, right + 10, 21, COLOR_ACCENT);
        guiGraphics.fill(left + 14, searchTop, right - 14, searchTop + 24, COLOR_SECTION);
        guiGraphics.fill(left + 14, statsRowY() - 6, right - 14, listStartY() - 12, COLOR_SECTION_SOFT);
        guiGraphics.fill(left + 14, statsRowY() - 6, right - 14, statsRowY() - 3, COLOR_BORDER);
        guiGraphics.fill(left + 14, listStartY() - 8, right - 14, listStartY() - 6, COLOR_BORDER);

        renderHeader(guiGraphics, left, right);

        renderSearchSection(guiGraphics, left, right);
        renderTopRow(guiGraphics, mouseX, mouseY, left, right);
        if (filtersExpanded) {
            renderSortRow(guiGraphics, mouseX, mouseY, left);
            renderScopeRow(guiGraphics, mouseX, mouseY, left);
            renderTradeRow(guiGraphics, mouseX, mouseY, left);
            renderNukeRow(guiGraphics, mouseX, mouseY, left);
        }
        renderTrackingSection(guiGraphics, mouseX, mouseY, left, right);

        super.render(guiGraphics, mouseX, mouseY, partialTick);
        renderSuggestions(guiGraphics, mouseX, mouseY, left, right);
        if (activeContentsOffer != null) {
            renderContentsOverlay(guiGraphics, mouseX, mouseY);
        }
        ClientNukeEffect.renderOverlay(minecraft, guiGraphics);

        int footerY = height - 30;
        if (dataStore.errorMessage() != null) {
            guiGraphics.drawCenteredString(font, Component.translatable("screen.pvcfinder.error", dataStore.errorMessage()), width / 2, footerY, COLOR_DANGER);
        } else if (dataStore.refreshErrorMessage() != null) {
            guiGraphics.drawCenteredString(font, Component.translatable("screen.pvcfinder.refresh_failed"), width / 2, footerY, COLOR_TEXT_MUTED);
        } else if (offerList != null && offerList.entryCount() == 0) {
            guiGraphics.drawCenteredString(font, Component.translatable("screen.pvcfinder.empty"), width / 2, footerY, COLOR_TEXT_MUTED);
        }
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }

    private void renderHeader(GuiGraphics guiGraphics, int left, int right) {
        int centerX = (left + right) / 2;
        int logoWidth = 22;
        int logoHeight = 18;
        int titleWidth = font.width(title);
        int blockWidth = logoWidth + 6 + titleWidth;
        int logoX = centerX - (blockWidth / 2);
        int logoY = 27;
        int titleX = logoX + logoWidth + 6;
        int titleY = 31;
        guiGraphics.blit(RenderPipelines.GUI_TEXTURED, LOGO_TEXTURE, logoX, logoY, 0.0F, 0.0F, logoWidth, logoHeight, LOGO_TEXTURE_WIDTH, LOGO_TEXTURE_HEIGHT);
        guiGraphics.drawString(font, title, titleX, titleY, COLOR_TEXT_BRIGHT, false);
    }

    private void renderSearchSection(GuiGraphics guiGraphics, int left, int right) {
        guiGraphics.fill(left + 18, searchSectionTop() + 3, right - 18, searchSectionTop() + 21, COLOR_PANEL_ALT);
        guiGraphics.fill(left + 18, searchSectionTop() + 4, right - 18, searchSectionTop() + 6, COLOR_ACCENT_DIM);
    }

    private void renderTopRow(GuiGraphics guiGraphics, int mouseX, int mouseY, int left, int right) {
        int rowY = statsRowY();
        int controlsY = controlsRowY();
        drawStatChip(guiGraphics, left + 20, rowY, "OFFERS " + dataStore.offerCount(), COLOR_EMERALD, COLOR_PANEL_ALT, 92);
        drawStatChip(guiGraphics, left + 124, rowY, "RESULTS " + (offerList == null ? 0 : offerList.entryCount()), COLOR_ACCENT, COLOR_PANEL_ALT, 102);
        int filterX = filterChipX(right);
        int refreshX = refreshChipX(right);
        if (!isCompactLayout()) {
            int statusX = left + 238;
            int statusMaxWidth = refreshX - statusX - 10;
            if (statusMaxWidth >= 72) {
                renderMarketStatusChip(guiGraphics, statusX, rowY, statusMaxWidth, dataStore.marketStatusLabel(), marketStatusAccent(), COLOR_PANEL_ALT);
            }
        }
        renderChip(
                guiGraphics,
                mouseX,
                mouseY,
                refreshX,
                controlsY,
                refreshChipLabel(),
                dataStore.isRefreshing(),
                dataStore.isRefreshing() ? COLOR_DIAMOND : COLOR_EMERALD,
                false
        );
        renderChip(
                guiGraphics,
                mouseX,
                mouseY,
                filterX,
                controlsY,
                filtersExpanded ? "Hide filters" : "Show filters",
                filtersExpanded,
                COLOR_ACCENT,
                false
        );
    }

    private void renderSuggestions(GuiGraphics guiGraphics, int mouseX, int mouseY, int left, int right) {
        if (!shouldRenderSuggestions()) {
            return;
        }

        int boxLeft = suggestionBoxLeft();
        int boxTop = suggestionBoxTop();
        int rowHeight = suggestionRowHeight();
        int boxRight = Math.min(boxLeft + suggestionBoxWidth(), right - 20);
        int boxBottom = boxTop + 4 + (searchSuggestions.size() * rowHeight) + 4;
        guiGraphics.fill(boxLeft, boxTop, boxRight, boxBottom, 0xF216100B);
        guiGraphics.fill(boxLeft, boxTop, boxLeft + 2, boxBottom, COLOR_ACCENT);
        guiGraphics.fill(boxLeft, boxTop, boxRight, boxTop + 1, COLOR_BORDER);
        guiGraphics.fill(boxLeft, boxBottom - 1, boxRight, boxBottom, COLOR_BORDER);

        for (int index = 0; index < searchSuggestions.size(); index++) {
            int rowTop = boxTop + 4 + (index * rowHeight);
            boolean hovered = isInside(mouseX, mouseY, boxLeft + 2, rowTop, (boxRight - boxLeft) - 4, rowHeight);
            if (hovered) {
                guiGraphics.fill(boxLeft + 4, rowTop, boxRight - 4, rowTop + rowHeight, 0x22000000);
            }
            PvcFinderSuggestion suggestion = searchSuggestions.get(index);
            guiGraphics.drawString(font, font.plainSubstrByWidth(suggestion.label(), boxRight - boxLeft - 16), boxLeft + 8, rowTop + 3, COLOR_TEXT_BRIGHT, false);
        }
    }

    private void renderSortRow(GuiGraphics guiGraphics, int mouseX, int mouseY, int left) {
        int y = sortRowY();
        drawFilterLabel(guiGraphics, "SORT", left + 20, y + 5);
        ChipFlow flow = new ChipFlow(left + 62, y, panelLeft() + panelWidth() - 24);
        for (PvcFinderFilters.SortMode option : PvcFinderFilters.SortMode.values()) {
            int chipX = flow.place(chipWidth(option.label(), false));
            renderChip(guiGraphics, mouseX, mouseY, chipX, flow.y, option.label(), sortMode == option, COLOR_ACCENT, false);
            flow.advance(chipWidth(option.label(), false));
        }
    }

    private void renderScopeRow(GuiGraphics guiGraphics, int mouseX, int mouseY, int left) {
        int y = scopeRowY();
        drawFilterLabel(guiGraphics, "SEARCH", left + 20, y + 5);
        ChipFlow flow = new ChipFlow(left + 74, y, panelLeft() + panelWidth() - 24);
        for (PvcFinderFilters.SearchScope option : PvcFinderFilters.SearchScope.values()) {
            int chipX = flow.place(chipWidth(option.label(), false));
            renderChip(guiGraphics, mouseX, mouseY, chipX, flow.y, option.label(), searchScope == option, COLOR_DIAMOND, false);
            flow.advance(chipWidth(option.label(), false));
        }
    }

    private void renderTradeRow(GuiGraphics guiGraphics, int mouseX, int mouseY, int left) {
        int y = tradeRowY();
        drawFilterLabel(guiGraphics, "TRADE", left + 20, y + 5);
        ChipFlow flow = new ChipFlow(left + 68, y, panelLeft() + panelWidth() - 24);
        for (PvcFinderFilters.TradeIntent option : PvcFinderFilters.TradeIntent.values()) {
            int chipWidth = chipWidth(option.label(), false);
            int chipX = flow.place(chipWidth);
            renderChip(guiGraphics, mouseX, mouseY, chipX, flow.y, option.label(), tradeIntent == option, COLOR_EMERALD, false);
            flow.advance(chipWidth);
        }

        int spacerWidth = 16;
        flow.advance(spacerWidth - CHIP_GAP);
        String inStockLabel = Component.translatable("screen.pvcfinder.filter_in_stock").getString();
        int inStockWidth = chipWidth(inStockLabel, true);
        int inStockX = flow.place(inStockWidth);
        renderChip(guiGraphics, mouseX, mouseY, inStockX, flow.y, inStockLabel, inStockOnly, COLOR_EMERALD, true);
        flow.advance(inStockWidth);
        String shulkerLabel = Component.translatable("screen.pvcfinder.filter_shulker").getString();
        int shulkerWidth = chipWidth(shulkerLabel, true);
        int shulkerX = flow.place(shulkerWidth);
        renderChip(guiGraphics, mouseX, mouseY, shulkerX, flow.y, shulkerLabel, includeShulker, COLOR_ACCENT, true);
        flow.advance(shulkerWidth);
    }

    private void renderNukeRow(GuiGraphics guiGraphics, int mouseX, int mouseY, int left) {
        int y = nukeRowY();
        drawFilterLabel(guiGraphics, "ALERT", left + 20, y + 5);
        String nukeLabel = Component.translatable("screen.pvcfinder.send_nuke").getString();
        renderChip(
                guiGraphics,
                mouseX,
                mouseY,
                left + 68,
                y,
                nukeLabel,
                false,
                COLOR_DANGER,
                false
        );
        int friendY = y + 24;
        drawFilterLabel(guiGraphics, "FRIEND", left + 20, friendY + 5);
        renderChip(
                guiGraphics,
                mouseX,
                mouseY,
                left + 68,
                friendY,
                jesusChipLabel(),
                PvcFinderClient.isImaginaryFriendActive(),
                COLOR_DIAMOND,
                false
        );
    }

    private void renderTrackingSection(GuiGraphics guiGraphics, int mouseX, int mouseY, int left, int right) {
        int y = trackingSectionY();
        guiGraphics.fill(left + 20, y, right - 20, y + 24, COLOR_PANEL_ALT);
        guiGraphics.fill(left + 20, y, right - 20, y + 2, COLOR_BORDER);
        guiGraphics.drawString(font, "TRACKED", left + 28, y + 8, COLOR_TEXT_GHOST, false);

        TrackedShopTarget trackedTarget = PvcFinderClient.trackedTarget();
        if (trackedTarget == null) {
            guiGraphics.drawString(font, "No active target", left + 88, y + 8, COLOR_TEXT_MUTED, false);
            return;
        }

        String summary = trackedTarget.label() + "  |  " + trackedTarget.position().getX() + ", " + trackedTarget.position().getY() + ", " + trackedTarget.position().getZ();
        String stopLabel = Component.translatable("screen.pvcfinder.stop_tracking").getString();
        int stopWidth = chipWidth(stopLabel, false);
        int stopX = right - stopWidth - 24;
        drawTrimmed(guiGraphics, summary, left + 88, y + 8, stopX - left - 100, COLOR_TEXT_BRIGHT);
        renderChip(
                guiGraphics,
                mouseX,
                mouseY,
                stopX,
                y + 3,
                stopLabel,
                true,
                COLOR_DANGER,
                false
        );
    }

    private boolean handleHeaderClick(double mouseX, double mouseY) {
        int left = panelLeft();
        int right = panelLeft() + panelWidth();
        int refreshWidth = chipWidth(refreshChipLabel(), false);
        if (isInside(mouseX, mouseY, refreshChipX(right), controlsRowY(), refreshWidth, CHIP_HEIGHT)) {
            dataStore.refreshAsync(minecraft, true);
            return true;
        }

        int toggleWidth = chipWidth(filtersExpanded ? "Hide filters" : "Show filters", false);
        if (isInside(mouseX, mouseY, filterChipX(right), controlsRowY(), toggleWidth, CHIP_HEIGHT)) {
            searchQuery = searchBox == null ? searchQuery : searchBox.getValue();
            filtersExpanded = !filtersExpanded;
            rebuildWidgets();
            return true;
        }

        if (!filtersExpanded) {
            return handleTrackingActionClick(mouseX, mouseY, right);
        }

        int y = sortRowY();
        ChipFlow flow = new ChipFlow(left + 62, y, panelLeft() + panelWidth() - 24);
        for (PvcFinderFilters.SortMode option : PvcFinderFilters.SortMode.values()) {
            int width = chipWidth(option.label(), false);
            int chipX = flow.place(width);
            if (isInside(mouseX, mouseY, chipX, flow.y, width, CHIP_HEIGHT)) {
                sortMode = option;
                refreshList();
                return true;
            }
            flow.advance(width);
        }

        y = scopeRowY();
        flow = new ChipFlow(left + 74, y, panelLeft() + panelWidth() - 24);
        for (PvcFinderFilters.SearchScope option : PvcFinderFilters.SearchScope.values()) {
            int width = chipWidth(option.label(), false);
            int chipX = flow.place(width);
            if (isInside(mouseX, mouseY, chipX, flow.y, width, CHIP_HEIGHT)) {
                searchScope = option;
                refreshList();
                return true;
            }
            flow.advance(width);
        }

        y = tradeRowY();
        flow = new ChipFlow(left + 68, y, panelLeft() + panelWidth() - 24);
        for (PvcFinderFilters.TradeIntent option : PvcFinderFilters.TradeIntent.values()) {
            int width = chipWidth(option.label(), false);
            int chipX = flow.place(width);
            if (isInside(mouseX, mouseY, chipX, flow.y, width, CHIP_HEIGHT)) {
                tradeIntent = option;
                refreshList();
                return true;
            }
            flow.advance(width);
        }

        String inStockLabel = Component.translatable("screen.pvcfinder.filter_in_stock").getString();
        int inStockWidth = chipWidth(inStockLabel, true);
        flow.advance(16 - CHIP_GAP);
        int inStockX = flow.place(inStockWidth);
        if (isInside(mouseX, mouseY, inStockX, flow.y, inStockWidth, CHIP_HEIGHT)) {
            inStockOnly = !inStockOnly;
            refreshList();
            return true;
        }
        flow.advance(inStockWidth);

        String shulkerLabel = Component.translatable("screen.pvcfinder.filter_shulker").getString();
        int shulkerWidth = chipWidth(shulkerLabel, true);
        int shulkerX = flow.place(shulkerWidth);
        if (isInside(mouseX, mouseY, shulkerX, flow.y, shulkerWidth, CHIP_HEIGHT)) {
            includeShulker = !includeShulker;
            refreshList();
            return true;
        }

        int nukeX = left + 68;
        int nukeY = filtersStartY() + 72;
        String nukeLabel = Component.translatable("screen.pvcfinder.send_nuke").getString();
        int nukeWidth = chipWidth(nukeLabel, false);
        if (isInside(mouseX, mouseY, nukeX, nukeY, nukeWidth, CHIP_HEIGHT)) {
            return PvcFinderClient.triggerTrackedNuke(minecraft);
        }

        int jesusX = left + 68;
        int jesusY = nukeY + 24;
        int jesusWidth = chipWidth(jesusChipLabel(), false);
        if (isInside(mouseX, mouseY, jesusX, jesusY, jesusWidth, CHIP_HEIGHT)) {
            PvcFinderClient.toggleImaginaryFriend(minecraft);
            return true;
        }

        return handleTrackingActionClick(mouseX, mouseY, right);
    }

    private boolean handleSuggestionClick(double mouseX, double mouseY) {
        if (!shouldRenderSuggestions()) {
            return false;
        }

        int left = suggestionBoxLeft();
        int top = suggestionBoxTop() + 4;
        int rowHeight = suggestionRowHeight();
        int width = suggestionBoxWidth();
        for (int index = 0; index < searchSuggestions.size(); index++) {
            int rowTop = top + (index * rowHeight);
            if (isInside(mouseX, mouseY, left, rowTop, width, rowHeight)) {
                searchQuery = searchSuggestions.get(index).label();
                searchBox.setValue(searchQuery);
                searchBox.setFocused(false);
                searchSuggestions = List.of();
                return true;
            }
        }
        return false;
    }

    private void refreshList() {
        if (offerList == null) {
            return;
        }

        List<OfferEntry> entries = dataStore.filterOffers(currentFilters())
                .stream()
                .sorted(Comparator.comparing((PvcOffer offer) -> !PvcFinderClient.isTracked(offer)))
                .map(OfferEntry::new)
                .toList();
        offerList.replaceEntries(entries);
        refreshSuggestions();
    }

    private void refreshSuggestions() {
        if (dataStore == null) {
            return;
        }
        searchSuggestions = dataStore.suggestions(currentFilters(), 3);
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
        int closeWidth = contentsCloseButtonWidth();
        guiGraphics.fill(0, 0, width, height, 0xA0000000);
        guiGraphics.fill(modalLeft, modalTop, modalRight, modalBottom, COLOR_PANEL);
        guiGraphics.fill(modalLeft, modalTop, modalRight, modalTop + 2, COLOR_ACCENT);
        guiGraphics.fill(modalLeft + 14, bodyTop - 6, modalRight - 14, bodyBottom + 10, COLOR_SECTION_SOFT);
        guiGraphics.drawString(font, Component.translatable("screen.pvcfinder.contents"), modalLeft + 16, modalTop + 14, COLOR_TEXT_BRIGHT, false);
        drawTrimmed(guiGraphics, activeContentsOffer.title(), modalLeft + 16, modalTop + 30, 220, COLOR_TEXT_MUTED);
        renderChip(
                guiGraphics,
                mouseX,
                mouseY,
                modalRight - closeWidth - 16,
                modalTop + 12,
                Component.translatable("screen.pvcfinder.close").getString(),
                false,
                COLOR_BORDER,
                false
        );

        guiGraphics.fill(bodyLeft, bodyTop, bodyRight, bodyBottom, COLOR_PANEL_ALT);
        guiGraphics.fill(bodyLeft, bodyTop, bodyRight, bodyTop + 2, COLOR_DIAMOND);
        guiGraphics.drawString(font, "Trade preview", bodyLeft + 12, bodyTop + 8, COLOR_TEXT_GHOST, false);
        drawTrimmed(guiGraphics, "Scroll to inspect every shulker involved in this trade.", bodyLeft + 12, bodyTop + 20, bodyRight - bodyLeft - 34, COLOR_TEXT_MUTED);

        List<String> lines = activeContentsOffer.previewContents();
        int visibleLines = contentsVisibleLines();
        int fromIndex = Mth.clamp(contentsScrollOffset, 0, contentsMaxScroll());
        int toIndex = Math.min(lines.size(), fromIndex + visibleLines);
        int y = bodyTop + 40;
        for (int index = fromIndex; index < toIndex; index++) {
            String line = lines.get(index);
            int rowTop = y;
            int rowBottom = rowTop + 12;
            if (!line.isBlank() && ((index - fromIndex) & 1) == 0) {
                guiGraphics.fill(bodyLeft + 8, rowTop - 1, bodyRight - 18, rowBottom + 1, 0x14000000);
            }
            if (!line.isBlank()) {
                boolean sectionLine = !line.startsWith("  ");
                drawTrimmed(
                        guiGraphics,
                        line.stripLeading(),
                        bodyLeft + 12,
                        rowTop + 1,
                        bodyRight - bodyLeft - 36,
                        sectionLine ? COLOR_DIAMOND : COLOR_TEXT
                );
            }
            y += 13;
        }

        if (fromIndex > 0) {
            guiGraphics.drawCenteredString(font, "^ more ^", (bodyLeft + bodyRight) / 2, bodyTop + 31, COLOR_TEXT_GHOST);
        }
        if (toIndex < lines.size()) {
            guiGraphics.drawCenteredString(font, "v more v", (bodyLeft + bodyRight) / 2, bodyBottom - 12, COLOR_TEXT_GHOST);
        }

        renderContentsScrollbar(guiGraphics, lines.size(), visibleLines, fromIndex, bodyRight - 10, bodyTop + 40, bodyBottom - 12);
        drawTrimmed(guiGraphics, lines.size() + " lines", modalLeft + 18, modalBottom - 18, 90, COLOR_TEXT_GHOST);
        drawTrimmed(guiGraphics, "Mouse wheel scrolls the trade preview.", modalLeft + 88, modalBottom - 18, 180, COLOR_TEXT_MUTED);
    }

    private void renderContentsScrollbar(GuiGraphics guiGraphics, int totalLines, int visibleLines, int offset, int x, int top, int bottom) {
        guiGraphics.fill(x, top, x + 4, bottom, 0x33000000);
        if (totalLines <= visibleLines) {
            guiGraphics.fill(x, top, x + 4, bottom, COLOR_BORDER);
            return;
        }

        int trackHeight = Math.max(16, bottom - top);
        int thumbHeight = Math.max(14, Mth.floor((visibleLines / (float) totalLines) * trackHeight));
        int maxOffset = Math.max(1, totalLines - visibleLines);
        int thumbTravel = Math.max(1, trackHeight - thumbHeight);
        int thumbTop = top + Mth.floor((offset / (float) maxOffset) * thumbTravel);
        guiGraphics.fill(x, thumbTop, x + 4, thumbTop + thumbHeight, COLOR_ACCENT);
    }

    private boolean handleContentsOverlayClick(double mouseX, double mouseY, int button) {
        if (button != 0) {
            return true;
        }

        if (!isInside(mouseX, mouseY, contentsModalLeft(), contentsModalTop(), contentsModalWidth(), contentsModalHeight())) {
            closeContentsPreview();
            return true;
        }

        int closeWidth = contentsCloseButtonWidth();
        int closeX = contentsModalLeft() + contentsModalWidth() - closeWidth - 16;
        int closeY = contentsModalTop() + 12;
        if (isInside(mouseX, mouseY, closeX, closeY, closeWidth, CHIP_HEIGHT)) {
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
        return 330;
    }

    private int contentsModalHeight() {
        return 212;
    }

    private int contentsModalLeft() {
        return (width / 2) - (contentsModalWidth() / 2);
    }

    private int contentsModalTop() {
        return (height / 2) - (contentsModalHeight() / 2);
    }

    private int contentsBodyLeft() {
        return contentsModalLeft() + 16;
    }

    private int contentsBodyTop() {
        return contentsModalTop() + 48;
    }

    private int contentsBodyRight() {
        return contentsModalLeft() + contentsModalWidth() - 16;
    }

    private int contentsBodyBottom() {
        return contentsModalTop() + contentsModalHeight() - 28;
    }

    private int contentsVisibleLines() {
        return Math.max(1, (contentsBodyBottom() - (contentsBodyTop() + 44)) / 13);
    }


    private int contentsMaxScroll() {
        if (activeContentsOffer == null) {
            return 0;
        }
        return Math.max(0, activeContentsOffer.previewContents().size() - contentsVisibleLines());
    }

    private int contentsCloseButtonWidth() {
        return chipWidth(Component.translatable("screen.pvcfinder.close").getString(), false);
    }

    private PvcFinderFilters currentFilters() {
        return new PvcFinderFilters(
                searchQuery.trim(),
                sortMode,
                inStockOnly,
                includeShulker,
                searchScope,
                tradeIntent
        );
    }

    private int panelWidth() {
        return Math.max(360, width - 48);
    }

    private int panelLeft() {
        return (width - panelWidth()) / 2;
    }

    private int listStartY() {
        return trackingSectionY() + 24;
    }

    private int trackingSectionY() {
        return filtersExpanded ? (filtersStartY() + totalFiltersHeight()) : (controlsRowY() + 28);
    }

    private int searchSectionTop() {
        return 42;
    }

    private int searchBoxY() {
        return searchSectionTop() + 6;
    }

    private int statsRowY() {
        return 70;
    }

    private int controlsRowY() {
        return isCompactLayout() ? (statsRowY() + 22) : statsRowY();
    }

    private int filtersStartY() {
        return controlsRowY() + CHIP_HEIGHT + 10;
    }

    private int sortRowY() {
        return filtersStartY();
    }

    private int scopeRowY() {
        return sortRowY() + rowHeightFor(sortRowStartX(), this::sortChipWidths);
    }

    private int tradeRowY() {
        return scopeRowY() + rowHeightFor(scopeRowStartX(), this::scopeChipWidths);
    }

    private int nukeRowY() {
        return tradeRowY() + rowHeightFor(tradeRowStartX(), this::tradeChipWidths);
    }

    private int totalFiltersHeight() {
        return (nukeRowY() - filtersStartY()) + 48;
    }

    private int sortRowStartX() {
        return panelLeft() + 62;
    }

    private int scopeRowStartX() {
        return panelLeft() + 74;
    }

    private int tradeRowStartX() {
        return panelLeft() + 68;
    }

    private int rowHeightFor(int startX, Supplier<int[]> widthsSupplier) {
        int rows = wrappedRowCount(startX, widthsSupplier.get());
        return Math.max(1, rows) * FILTER_ROW_PITCH;
    }

    private int wrappedRowCount(int startX, int[] chipWidths) {
        int maxRight = panelLeft() + panelWidth() - 24;
        int x = startX;
        int rows = 1;
        for (int chipWidth : chipWidths) {
            if (x != startX && (x + chipWidth) > maxRight) {
                rows++;
                x = startX;
            }
            x += chipWidth + CHIP_GAP;
        }
        return rows;
    }

    private int[] sortChipWidths() {
        return java.util.Arrays.stream(PvcFinderFilters.SortMode.values())
                .mapToInt(option -> chipWidth(option.label(), false))
                .toArray();
    }

    private int[] scopeChipWidths() {
        return java.util.Arrays.stream(PvcFinderFilters.SearchScope.values())
                .mapToInt(option -> chipWidth(option.label(), false))
                .toArray();
    }

    private int[] tradeChipWidths() {
        String inStockLabel = Component.translatable("screen.pvcfinder.filter_in_stock").getString();
        String shulkerLabel = Component.translatable("screen.pvcfinder.filter_shulker").getString();
        int[] intentWidths = java.util.Arrays.stream(PvcFinderFilters.TradeIntent.values())
                .mapToInt(option -> chipWidth(option.label(), false))
                .toArray();
        int[] allWidths = new int[intentWidths.length + 3];
        System.arraycopy(intentWidths, 0, allWidths, 0, intentWidths.length);
        allWidths[intentWidths.length] = 16;
        allWidths[intentWidths.length + 1] = chipWidth(inStockLabel, true);
        allWidths[intentWidths.length + 2] = chipWidth(shulkerLabel, true);
        return allWidths;
    }

    private int suggestionBoxLeft() {
        return searchBox == null ? panelLeft() + 22 : searchBox.getX();
    }

    private int suggestionBoxTop() {
        return (searchBox == null ? searchBoxY() : searchBox.getY()) + 22;
    }

    private int suggestionBoxWidth() {
        int available = searchBox == null ? panelWidth() - 44 : searchBox.getWidth();
        return Mth.clamp(Math.min(available, 320), 210, 320);
    }

    private int suggestionRowHeight() {
        return 14;
    }

    private boolean isCompactLayout() {
        return panelWidth() <= COMPACT_LAYOUT_WIDTH;
    }

    private int offerRowHeight() {
        return isCompactLayout() ? 108 : 88;
    }

    private void drawFilterLabel(GuiGraphics guiGraphics, String label, int x, int y) {
        guiGraphics.drawString(font, label, x, y, COLOR_TEXT_GHOST, false);
    }

    private String jesusChipLabel() {
        return Component.translatable(
                PvcFinderClient.isImaginaryFriendActive()
                        ? "screen.pvcfinder.hide_jesus"
                        : "screen.pvcfinder.spawn_jesus"
        ).getString();
    }

    private void drawStatChip(GuiGraphics guiGraphics, int x, int y, String text, int accent, int background, int minWidth) {
        int chipWidth = Math.max(minWidth, font.width(text) + 14);
        guiGraphics.fill(x, y, x + chipWidth, y + 16, background);
        guiGraphics.fill(x, y, x + chipWidth, y + 2, accent);
        guiGraphics.drawString(font, text, x + 7, y + 5, COLOR_TEXT_BRIGHT, false);
    }

    private void renderMarketStatusChip(GuiGraphics guiGraphics, int x, int y, int maxWidth, String text, int accent, int background) {
        int boundedMax = Math.max(24, maxWidth);
        int chipWidth = Mth.clamp(Math.max(72, font.width(text) + 14), 72, boundedMax);
        guiGraphics.fill(x, y, x + chipWidth, y + 16, background);
        guiGraphics.fill(x, y, x + chipWidth, y + 2, accent);
        guiGraphics.drawString(font, font.plainSubstrByWidth(text, chipWidth - 14), x + 7, y + 5, COLOR_TEXT_BRIGHT, false);
    }

    private void renderChip(GuiGraphics guiGraphics, int mouseX, int mouseY, int x, int y, String label, boolean active, int accent, boolean toggle) {
        int width = chipWidth(label, toggle);
        boolean hovered = isInside(mouseX, mouseY, x, y, width, CHIP_HEIGHT);
        int body = active ? 0xFF2A1A10 : COLOR_PANEL_ALT;
        if (hovered && !active) {
            body = 0xFF24160D;
        }

        guiGraphics.fill(x, y, x + width, y + CHIP_HEIGHT, body);
        guiGraphics.fill(x, y, x + width, y + 2, active ? accent : COLOR_BORDER);
        guiGraphics.fill(x, y, x + 1, y + CHIP_HEIGHT, COLOR_BORDER);
        guiGraphics.fill(x + width - 1, y, x + width, y + CHIP_HEIGHT, COLOR_BORDER);
        guiGraphics.fill(x, y + CHIP_HEIGHT - 1, x + width, y + CHIP_HEIGHT, COLOR_BORDER);

        int textX = x + 8;
        if (toggle) {
            guiGraphics.fill(x + 7, y + 5, x + 13, y + 11, active ? accent : COLOR_TEXT_GHOST);
            textX = x + 18;
        }
        guiGraphics.drawString(font, label, textX, y + 5, active ? COLOR_TEXT_BRIGHT : COLOR_TEXT, false);
    }

    private int chipWidth(String label, boolean toggle) {
        return font.width(label) + (toggle ? 28 : 16);
    }

    private String refreshChipLabel() {
        return dataStore.isRefreshing()
                ? Component.translatable("screen.pvcfinder.refreshing").getString()
                : "Refresh";
    }

    private int filterChipX(int right) {
        return right - chipWidth(filtersExpanded ? "Hide filters" : "Show filters", false) - 22;
    }

    private int refreshChipX(int right) {
        return filterChipX(right) - chipWidth(refreshChipLabel(), false) - CHIP_GAP;
    }

    private static final class ChipFlow {
        private final int startX;
        private final int maxRight;
        private int x;
        private int y;

        private ChipFlow(int startX, int y, int maxRight) {
            this.startX = startX;
            this.x = startX;
            this.y = y;
            this.maxRight = maxRight;
        }

        private int place(int width) {
            if (x != startX && (x + width) > maxRight) {
                x = startX;
                y += FILTER_ROW_PITCH;
            }
            return x;
        }

        private void advance(int width) {
            x += width + CHIP_GAP;
        }
    }

    private boolean handleTrackingActionClick(double mouseX, double mouseY, int right) {
        TrackedShopTarget trackedTarget = PvcFinderClient.trackedTarget();
        if (trackedTarget == null) {
            return false;
        }

        int trackY = trackingSectionY() + 3;
        int stopWidth = chipWidth(Component.translatable("screen.pvcfinder.stop_tracking").getString(), false);
        int stopX = right - stopWidth - 24;
        if (isInside(mouseX, mouseY, stopX, trackY, stopWidth, CHIP_HEIGHT)) {
            PvcFinderClient.clearTrackingFromScreen(minecraft);
            refreshList();
            return true;
        }
        return false;
    }

    private int marketStatusAccent() {
        if (dataStore.isRefreshing()) {
            return COLOR_DIAMOND;
        }
        return switch (dataStore.snapshotSource()) {
            case LIVE -> dataStore.isStale() ? COLOR_ACCENT : COLOR_EMERALD;
            case CACHE -> dataStore.isStale() ? COLOR_DANGER : COLOR_BORDER;
            case BUNDLED -> dataStore.isStale() ? COLOR_DANGER : COLOR_BORDER;
        };
    }

    private boolean shouldRenderSuggestions() {
        return activeContentsOffer == null
                && searchBox != null
                && searchBox.isFocused()
                && searchScope == PvcFinderFilters.SearchScope.ITEM
                && searchQuery.trim().length() >= 2
                && !searchSuggestions.isEmpty();
    }

    private void blurSearchIfNeeded(double mouseX, double mouseY) {
        if (searchBox == null || !searchBox.isFocused()) {
            return;
        }
        if (isInside(mouseX, mouseY, searchBox.getX(), searchBox.getY(), searchBox.getWidth(), searchBox.getHeight())) {
            return;
        }
        if (shouldRenderSuggestions()) {
            int left = suggestionBoxLeft();
            int top = suggestionBoxTop();
            int width = suggestionBoxWidth();
            int height = 8 + (searchSuggestions.size() * suggestionRowHeight());
            if (isInside(mouseX, mouseY, left, top, width, height)) {
                return;
            }
        }
        searchBox.setFocused(false);
    }

    private boolean focusSearchIfClicked(double mouseX, double mouseY, MouseButtonEvent event, boolean doubleClick) {
        if (searchBox == null || !isInside(mouseX, mouseY, searchBox.getX(), searchBox.getY(), searchBox.getWidth(), searchBox.getHeight())) {
            return false;
        }
        setFocused(searchBox);
        searchBox.setFocused(true);
        return searchBox.mouseClicked(event, doubleClick);
    }

    private boolean isInside(double mouseX, double mouseY, int x, int y, int width, int height) {
        return mouseX >= x && mouseX < (x + width) && mouseY >= y && mouseY < (y + height);
    }

    private void drawTrimmed(GuiGraphics guiGraphics, String text, int x, int y, int maxWidth, int color) {
        guiGraphics.drawString(font, font.plainSubstrByWidth(text, Math.max(maxWidth, 30)), x, y, color, false);
    }

    private final class OfferList extends ContainerObjectSelectionList<OfferEntry> {
        private OfferList(Minecraft minecraft, int width, int height, int y0, int itemHeight) {
            super(minecraft, width, height, y0, itemHeight);
            this.centerListVertically = false;
        }

        @Override
        public int getRowWidth() {
            return Math.max(320, PvcFinderScreen.this.panelWidth() - 40);
        }

        @Override
        protected int scrollBarX() {
            return (PvcFinderScreen.this.width + getRowWidth()) / 2 + 4;
        }

        @Override
        protected void renderListBackground(GuiGraphics guiGraphics) {
        }

        @Override
        protected void renderListSeparators(GuiGraphics guiGraphics) {
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
                refreshList();
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
            boolean tracked = PvcFinderClient.isTracked(offer);
            boolean compact = width <= 760;
            int background = hovered ? 0xE21A1209 : 0xD717110C;
            int accent = tracked ? COLOR_ACCENT : COLOR_BORDER;
            int iconBoxLeft = left + 10;
            int iconBoxRight = left + 58;
            int summaryPanelWidth = compact ? 116 : SUMMARY_PANEL_WIDTH;
            int summaryPanelLeft = left + width - summaryPanelWidth;
            int textLeft = left + 72;
            int textRight = compact ? (left + width - 14) : (summaryPanelLeft - 12);

            guiGraphics.fill(left, top, left + width, top + height - 4, background);
            guiGraphics.fill(left, top, left + width, top + 3, accent);
            guiGraphics.fill(left + 1, top + height - 5, left + width - 1, top + height - 4, COLOR_BORDER);
            guiGraphics.fill(iconBoxLeft, top + 10, iconBoxRight, top + 54, 0xCC10151E);
            guiGraphics.fill(iconBoxLeft, top + 10, iconBoxRight, top + 12, tracked ? COLOR_ACCENT : COLOR_DIAMOND);
            int summaryTop = top + 8;
            int summaryBottom = compact ? (top + 48) : (top + height - 8);
            guiGraphics.fill(summaryPanelLeft, summaryTop, left + width - 10, summaryBottom, 0xD0152018);
            guiGraphics.fill(summaryPanelLeft, summaryTop, left + width - 10, summaryTop + 2, offer.stock() > 0 ? COLOR_EMERALD : COLOR_DANGER);

            ItemStack stack = offer.resultItem().toItemStack();
            guiGraphics.renderItem(stack, iconBoxLeft + 11, top + 19);

            drawTrimmed(guiGraphics, offer.title(), textLeft, top + 12, textRight - textLeft, COLOR_TEXT_BRIGHT);
            drawTrimmed(guiGraphics, offer.priceLabel(), textLeft, top + 25, textRight - textLeft, COLOR_ACCENT);
            drawTrimmed(guiGraphics, offer.shop().displayName() + "  |  " + offer.shop().displayOwner(), textLeft, top + 39, textRight - textLeft, COLOR_TEXT);
            drawTrimmed(
                    guiGraphics,
                    offer.shop().dimensionLabel() + "  |  " + offer.shop().coordsLabel() + "  |  " + PvcFinderClient.offerDistanceLabel(minecraft, offer),
                    textLeft,
                    top + 52,
                    textRight - textLeft,
                    offer.stock() > 0 ? COLOR_TEXT_MUTED : COLOR_DANGER
            );

            int summaryCenterX = summaryPanelLeft + ((left + width - 10 - summaryPanelLeft) / 2);
            guiGraphics.drawCenteredString(font, "STOCK", summaryCenterX, top + 14, COLOR_TEXT_GHOST);
            guiGraphics.drawCenteredString(font, offer.stock() > 0 ? String.valueOf(offer.stock()) : "0", summaryCenterX, top + 27, offer.stock() > 0 ? COLOR_EMERALD : COLOR_DANGER);
            guiGraphics.drawCenteredString(font, tracked ? "TRACKED" : "READY", summaryCenterX, top + 40, tracked ? COLOR_ACCENT : COLOR_TEXT);

            int buttonY = compact ? (top + 72) : (top + 52);
            int actionAreaLeft = compact ? textLeft : summaryPanelLeft;
            int actionAreaRight = compact ? (left + width - 12) : (left + width - 10);
            int actionAreaWidth = actionAreaRight - actionAreaLeft;
            if (contentsButton != null) {
                int actionWidth = CONTENTS_BUTTON_WIDTH + ACTION_BUTTON_GAP + TRACK_BUTTON_WIDTH;
                int actionsLeft = actionAreaLeft + Math.max(0, Mth.floor((actionAreaWidth - actionWidth) / 2.0F));
                int contentsX = actionsLeft;
                int trackX = contentsX + CONTENTS_BUTTON_WIDTH + ACTION_BUTTON_GAP;
                contentsButton.setX(contentsX);
                contentsButton.setY(buttonY);
                trackButton.setX(trackX);
                trackButton.setY(buttonY);
                renderActionButton(guiGraphics, mouseX, mouseY, contentsButton, false, COLOR_DIAMOND);
            } else {
                int buttonX = actionAreaLeft + Math.max(0, Mth.floor((actionAreaWidth - TRACK_BUTTON_WIDTH) / 2.0F));
                trackButton.setX(buttonX);
                trackButton.setY(buttonY);
            }
            trackButton.setMessage(trackLabel());
            renderActionButton(guiGraphics, mouseX, mouseY, trackButton, tracked, tracked ? COLOR_ACCENT : COLOR_BORDER);
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
                    ? Component.translatable("screen.pvcfinder.stop_tracking")
                    : Component.translatable("screen.pvcfinder.track");
        }

        private void renderActionButton(GuiGraphics guiGraphics, int mouseX, int mouseY, Button button, boolean active, int accent) {
            int x = button.getX();
            int y = button.getY();
            int width = button.getWidth();
            boolean hovered = isInside(mouseX, mouseY, x, y, width, ACTION_BUTTON_HEIGHT);
            int body = active ? 0xFF3C2413 : 0xFF21160D;
            guiGraphics.fill(x, y, x + width, y + ACTION_BUTTON_HEIGHT, body);
            guiGraphics.fill(x, y, x + width, y + 2, accent);
            guiGraphics.fill(x, y, x + 2, y + ACTION_BUTTON_HEIGHT, accent);
            guiGraphics.fill(x + width - 2, y, x + width, y + ACTION_BUTTON_HEIGHT, accent);
            guiGraphics.fill(x, y + ACTION_BUTTON_HEIGHT - 2, x + width, y + ACTION_BUTTON_HEIGHT, accent);
            if (hovered) {
                guiGraphics.fill(x + 2, y + 2, x + width - 2, y + ACTION_BUTTON_HEIGHT - 2, 0x24000000);
            }
            guiGraphics.drawCenteredString(font, button.getMessage(), x + (width / 2), y + 6, active ? COLOR_TEXT_BRIGHT : COLOR_TEXT);
        }
    }
}
