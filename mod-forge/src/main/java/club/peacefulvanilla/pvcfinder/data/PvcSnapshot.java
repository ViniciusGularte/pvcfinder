package club.peacefulvanilla.pvcfinder.data;

import java.util.List;

public record PvcSnapshot(String dumpedAt, List<PvcOffer> offers) {
}
