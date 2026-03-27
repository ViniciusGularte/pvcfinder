package club.peacefulvanilla.pvcfinder.client;

import club.peacefulvanilla.pvcfinder.data.PvcOffer;
import club.peacefulvanilla.pvcfinder.data.PvcSnapshot;
import club.peacefulvanilla.pvcfinder.data.PvcSnapshotParser;
import net.minecraft.client.Minecraft;

import java.io.IOException;
import java.util.List;

public final class PvcFinderDataStore {
    private final PvcSnapshotParser parser = new PvcSnapshotParser();
    private PvcSnapshot snapshot;
    private String errorMessage;

    public void ensureLoaded(Minecraft minecraft) {
        if (snapshot != null || errorMessage != null) {
            return;
        }

        try {
            snapshot = parser.load(minecraft.getResourceManager());
        } catch (IOException error) {
            errorMessage = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
        }
    }

    public List<PvcOffer> filterOffers(String query) {
        if (snapshot == null) {
            return List.of();
        }
        return snapshot.offers().stream().filter(offer -> offer.matches(query)).toList();
    }

    public int offerCount() {
        return snapshot == null ? 0 : snapshot.offers().size();
    }

    public String dumpedAt() {
        return snapshot == null ? "unknown" : snapshot.dumpedAt();
    }

    public String errorMessage() {
        return errorMessage;
    }
}
