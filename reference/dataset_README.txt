128 px Forest / Not Forest dataset
==================================

train/   upload to Teachable Machine: one class per folder
         forest      268 tiles  (146 pure forest + 122 partly cleared, up to 30% cleared)
         not_forest  300 tiles  (150 are 50-75% cleared, 150 are over 75% cleared)
         All from the 11 original training regions, same 2025 dry-season imagery.

test/    do NOT train on these; use them to score the new model
         forest 63, not_forest 80, from 16 regions never used for training
         (the 10 original test regions plus the hard-test regions)

Labels: NDMI cleared fraction of each 1.28 km tile.
        forest if 30% or less cleared, not_forest if 50% or more; 30-50% left out.
        Every forest tile from a frontier region was checked by eye. 32 train and 17 test
        tiles that were really green pasture, cropland or plantation were removed
        (listed in exclude_train.json / exclude_test.json).

Baseline: the current 256 px model gets 126/143 (88%) on test/.
          Pure forest 38/40, partly cleared forest 9/23, not_forest 79/80.
          The partly cleared forest tiles are the ones the new model should improve on.

Rebuild:  python build_dataset_128.py train   /   python build_dataset_128.py test
          (needs build_dataset.py alongside and CDSE_CLIENT_ID / CDSE_CLIENT_SECRET set)

Note: in the website, cut scenes into 128 px tiles the same way, otherwise the model
sees a different scale from the one it was trained on.
