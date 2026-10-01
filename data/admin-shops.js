(() => {
  const typeOf = (name) =>
    String(name || "item")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .toUpperCase();

  const item = (name, amount = 1, type = "") => ({
    type: type || typeOf(name),
    name,
    enchant: {},
    amount,
  });

  const trade = (costs, amount, product, productType = "") => ({
    item1: item(costs[0][1], costs[0][0], costs[0][2]),
    ...(costs[1] ? { item2: item(costs[1][1], costs[1][0], costs[1][2]) } : {}),
    resultItem: item(product, amount, productType),
    // The UI renders admin supply as unlimited. A neutral value keeps the
    // synthetic catalog from dominating normal stock sorting and statistics.
    stock: 1,
  });

  const shop = (shopName, location, recipes, world = "World") => ({
    shopName,
    shopOwner: "PVC Admin",
    location,
    world,
    isAdminShop: true,
    recipes,
  });

  const emerald = (amount) => [
    amount,
    amount === 1 ? "Emerald" : "Emeralds",
    "EMERALD",
  ];
  const diamond = (amount) => [
    amount,
    amount === 1 ? "Diamond" : "Diamonds",
    "DIAMOND",
  ];
  const gold = (amount) => [
    amount,
    amount === 1 ? "Gold Ingot" : "Gold Ingots",
    "GOLD_INGOT",
  ];
  const iron = (amount) => [
    amount,
    amount === 1 ? "Iron Ingot" : "Iron Ingots",
    "IRON_INGOT",
  ];

  window.PVC_ADMIN_SHOPS = [
    shop("The Sand Vendor", "-550, 66, -840", [
      trade([emerald(2)], 64, "Sand", "SAND"),
      trade([emerald(3)], 64, "Sandstone", "SANDSTONE"),
      trade([emerald(3)], 64, "Cut Sandstone", "CUT_SANDSTONE"),
      trade([emerald(3)], 64, "Chiseled Sandstone", "CHISELED_SANDSTONE"),
      trade([emerald(2)], 64, "Red Sand", "RED_SAND"),
      trade([emerald(3)], 64, "Red Sandstone", "RED_SANDSTONE"),
      trade([emerald(3)], 64, "Cut Red Sandstone", "CUT_RED_SANDSTONE"),
      trade(
        [emerald(3)],
        64,
        "Chiseled Red Sandstone",
        "CHISELED_RED_SANDSTONE",
      ),
    ]),
    shop("Mysterious Column", "1225, 80, -390", [
      trade([[4, "Sticks", "STICK"], iron(12)], 2, "Gunpowder", "GUNPOWDER"),
      trade([emerald(32), iron(16)], 1, "Scute", "SCUTE"),
      trade([emerald(6), gold(32)], 1, "Turtle Egg", "TURTLE_EGG"),
      trade([emerald(24), gold(14)], 2, "Ender Pearls", "ENDER_PEARL"),
      trade([[2, "Sticks", "STICK"], iron(4)], 2, "Redstone Dust", "REDSTONE"),
      trade([emerald(2), [4, "Sand", "SAND"]], 4, "Clay", "CLAY"),
      trade([emerald(38), gold(14)], 2, "Nautilus Shell", "NAUTILUS_SHELL"),
    ]),
    shop("Woodville Cartographer", "-800, 60, 600", [
      trade([emerald(6)], 1, "Empty Map", "MAP"),
      trade([emerald(2)], 1, "Lime Banner", "LIME_BANNER"),
      trade([emerald(5)], 1, "Item Frame", "ITEM_FRAME"),
    ]),
    shop("Woodville Butcher", "-800, 60, 600", [
      trade([emerald(1)], 10, "Cooked Chicken", "COOKED_CHICKEN"),
      trade([emerald(2)], 7, "Bread", "BREAD"),
      trade([emerald(4)], 1, "Beetroot Soup", "BEETROOT_SOUP"),
    ]),
    shop("Woodville Shepherd", "-800, 60, 600", [
      trade([emerald(2)], 1, "Blue Wool", "BLUE_WOOL"),
      trade([emerald(1)], 1, "Blue Bed", "BLUE_BED"),
      trade([emerald(2)], 1, "Cyan Wool", "CYAN_WOOL"),
      trade([emerald(1)], 1, "Red Bed", "RED_BED"),
      trade([emerald(1)], 1, "Shears", "SHEARS"),
      trade([emerald(1)], 6, "Blue Carpet", "BLUE_CARPET"),
    ]),
    shop("Woodville Stone Mason", "-800, 60, 600", [
      trade([emerald(2)], 6, "Polished Granite", "POLISHED_GRANITE"),
      trade([emerald(2)], 6, "Polished Diorite", "POLISHED_DIORITE"),
      trade([emerald(2)], 6, "Polished Andesite", "POLISHED_ANDESITE"),
    ]),
    shop("Woodville Armorer", "-800, 60, 600", [
      trade(
        [emerald(31), [4, "Leather", "LEATHER"]],
        1,
        "Diamond Helmet",
        "DIAMOND_HELMET",
      ),
      trade(
        [emerald(35), [8, "Leather", "LEATHER"]],
        1,
        "Diamond Chestplate",
        "DIAMOND_CHESTPLATE",
      ),
      trade(
        [emerald(33), [6, "Leather", "LEATHER"]],
        1,
        "Diamond Leggings",
        "DIAMOND_LEGGINGS",
      ),
      trade(
        [emerald(30), [4, "Leather", "LEATHER"]],
        1,
        "Diamond Boots",
        "DIAMOND_BOOTS",
      ),
      trade(
        [emerald(48), [6, "Sticks", "STICK"]],
        1,
        "Diamond Horse Armor",
        "DIAMOND_HORSE_ARMOR",
      ),
    ]),
    shop("Woodville Weaponsmith", "-800, 60, 600", [
      trade([emerald(2)], 1, "Iron Axe", "IRON_AXE"),
      trade([emerald(16)], 1, "Diamond Pickaxe", "DIAMOND_PICKAXE"),
      trade([emerald(20)], 1, "Diamond Sword", "DIAMOND_SWORD"),
    ]),
    shop("Woodville EveryStuff", "-800, 60, 600", [
      trade([emerald(1)], 13, "Raw Chicken", "CHICKEN"),
      trade([emerald(1)], 5, "Sweet Berries", "SWEET_BERRIES"),
      trade([emerald(4)], 10, "Paper", "PAPER"),
      trade([emerald(2)], 6, "Bread", "BREAD"),
      trade([emerald(3)], 14, "Coal", "COAL"),
      trade([emerald(1)], 13, "Flint", "FLINT"),
    ]),
    shop("The Claim Shop", "-168, 108, 116", [
      trade([diamond(4), [1, "Playtime Certificate"]], 1, "Lapis Claim Block"),
      trade([diamond(12), [2, "Playtime Certificates"]], 1, "Coal Claim Block"),
      trade(
        [
          [10, "Diamond Blocks", "DIAMOND_BLOCK"],
          [4, "Playtime Certificates"],
        ],
        1,
        "Redstone Claim Block",
      ),
      trade(
        [
          [1, "Redstone Claim Block"],
          [1, "Playtime Certificate"],
        ],
        6,
        "Chunk Claim Block",
      ),
    ]),
    shop("Villager Eggs Shop", "-165, 108, 116", [
      trade(
        [diamond(6), [2, "Gold Blocks", "GOLD_BLOCK"]],
        1,
        "Villager Spawn Egg",
        "VILLAGER_SPAWN_EGG",
      ),
      trade(
        [diamond(6), [3, "Gold Blocks", "GOLD_BLOCK"]],
        2,
        "Villager Spawn Eggs",
        "VILLAGER_SPAWN_EGG",
      ),
      trade(
        [diamond(6), [4, "Gold Blocks", "GOLD_BLOCK"]],
        5,
        "Villager Spawn Eggs",
        "VILLAGER_SPAWN_EGG",
      ),
    ]),
    shop("Amalfi the Morph", "-166, 109, 117", [
      trade(
        [
          [8, "Playtime Certificates"],
          [8, "Diamond Blocks", "DIAMOND_BLOCK"],
        ],
        1,
        "Pig Morph Cosmetic",
      ),
      trade(
        [
          [6, "Playtime Certificates"],
          [1, "Death Donation Item"],
        ],
        1,
        "Zombie Morph Cosmetic",
      ),
      trade(
        [
          [5, "Playtime Certificates"],
          [1, "Snow Donation Item"],
        ],
        1,
        "Snowman Morph Cosmetic",
      ),
      trade(
        [
          [5, "Playtime Certificates"],
          [1, "Stickyness Donation Item"],
        ],
        1,
        "Slime Morph Cosmetic",
      ),
    ]),
    shop("Bimbus", "-186, 109, 122", [
      trade(
        [
          [28, "Emerald Blocks", "EMERALD_BLOCK"],
          [2, "Playtime Certificates"],
        ],
        4,
        "Mycelium",
        "MYCELIUM",
      ),
      trade([emerald(2)], 1, "Brown Mushroom", "BROWN_MUSHROOM"),
      trade([emerald(4)], 1, "Red Mushroom", "RED_MUSHROOM"),
    ]),
    shop("Ancient Farmer", "-168, 105, 132", [
      trade([emerald(4)], 16, "Wheat", "WHEAT"),
      trade([emerald(3)], 6, "Carrots", "CARROT"),
      trade([emerald(8)], 12, "Potatoes", "POTATO"),
      trade(
        [
          [2, "Potatoes", "POTATO"],
          [2, "Carrots", "CARROT"],
        ],
        14,
        "Wheat Seeds",
        "WHEAT_SEEDS",
      ),
      trade(
        [emerald(6), [3, "Wheat Seeds", "WHEAT_SEEDS"]],
        16,
        "Bone Meal",
        "BONE_MEAL",
      ),
    ]),
    shop("Devoted", "-157, 108, 123", [
      trade(
        [
          [1, "Playtime Certificate"],
          [3, "Vote Certificates"],
        ],
        64,
        "Invisible Item Frame",
      ),
      trade(
        [
          [12, "Playtime Certificates"],
          [12, "Vote Certificates"],
        ],
        1,
        "Nerchius PVC",
      ),
      trade(
        [
          [6, "Playtime Certificates"],
          [5, "Vote Certificates"],
        ],
        1,
        "Neptune",
      ),
      trade(
        [
          [8, "Playtime Certificates"],
          [8, "Vote Certificates"],
        ],
        1,
        "Justice",
      ),
      trade(
        [
          [2, "Playtime Certificates"],
          [3, "Vote Certificates"],
        ],
        1,
        "Lumberjack",
      ),
      trade(
        [
          [6, "Playtime Certificates"],
          [7, "Vote Certificates"],
        ],
        1,
        "Sanctuary",
      ),
      trade(
        [
          [1, "Playtime Certificate"],
          [1, "Vote Certificate"],
        ],
        1,
        "Tenacity",
      ),
    ]),
    shop("Vegeto", "-153, 107, 122", [
      trade(
        [
          [16, "Caddozzo"],
          [4, "Netherite Ingots", "NETHERITE_INGOT"],
        ],
        1,
        "Owner Contract",
      ),
      trade([[10, "Owner Contracts"]], 1, "Make Your Own Token"),
      trade([[4, "Owner Contracts"]], 1, "60 Day PVC Banner Ad"),
      trade([[1, "Owner Contract"]], 32, "Sponsor Tokens"),
      trade([[1, "Owner Contract"]], 1, "Admin Region Protection"),
    ]),
    shop("Event Master", "-180, 100, 100", [
      trade(
        [
          [40, "Event Coins"],
          [2, "Playtime Certificates"],
        ],
        1,
        "Big Claim Book",
      ),
      trade([[12, "Event Coins"]], 1, "Undying Swiftness"),
      trade([[4, "Event Coins"]], 1, "Diamond Block", "DIAMOND_BLOCK"),
      trade(
        [
          [50, "Event Coins"],
          [2, "Superemeralds"],
        ],
        1,
        "Self-Regenerating Helmet",
      ),
      trade(
        [
          [60, "Event Coins"],
          [3, "Superemeralds"],
        ],
        1,
        "Self-Regenerating Chestplate",
      ),
    ]),
    shop("Ciro Immobile", "-203, 63, -148", [
      trade(
        [gold(4), diamond(1)],
        1,
        "Diamond Horse Armor",
        "DIAMOND_HORSE_ARMOR",
      ),
      trade([gold(4), iron(4)], 1, "Iron Horse Armor", "IRON_HORSE_ARMOR"),
      trade([gold(8)], 1, "Gold Horse Armor", "GOLDEN_HORSE_ARMOR"),
      trade([gold(2), iron(6)], 12, "Gilded Blackstone", "GILDED_BLACKSTONE"),
      trade([gold(12), diamond(2)], 1, "Heart of the Sea", "HEART_OF_THE_SEA"),
      trade([gold(2), iron(8)], 6, "Sponge", "SPONGE"),
      trade([gold(6), iron(2)], 14, "Cobweb", "COBWEB"),
    ]),
    shop("Wiki Master", "-90, 60, 165", [
      trade([[2, "Writer's Quills"]], 1, "Golden Apple", "GOLDEN_APPLE"),
      trade([[5, "Writer's Quills"]], 3, "Diamonds", "DIAMOND"),
      trade([[10, "Writer's Quills"]], 1, "Diamond Block", "DIAMOND_BLOCK"),
      trade([[64, "Writer's Quills"]], 1, "Netherite Ingot", "NETHERITE_INGOT"),
      trade(
        [[128, "Writer's Quills"]],
        3,
        "Netherite Ingots",
        "NETHERITE_INGOT",
      ),
      trade([[128, "Writer's Quills"]], 1, "Wiki Writer Tag"),
    ]),
    shop("Ferrando Conservatori", "-91, 64, 164", [
      trade(
        [
          [2, "Playtime Certificates"],
          [16, "Wiki Quills"],
        ],
        1,
        "Skip the Queue Ticket",
      ),
      trade(
        [
          [8, "Playtime Certificates"],
          [32, "Wiki Quills"],
        ],
        1,
        "Skip the Queue Ticket",
      ),
      trade(
        [
          [16, "Playtime Certificates"],
          [8, "Wiki Quills"],
        ],
        1,
        "Skip the Queue Ticket",
      ),
    ]),
    shop("Kendall Jenner", "-170, 74, 78", [
      trade(
        [[8, "Influencer's Apples"]],
        6,
        "Netherite Scrap",
        "NETHERITE_SCRAP",
      ),
      trade([[8, "Influencer's Apples"]], 4, "Diamond Blocks", "DIAMOND_BLOCK"),
      trade([[8, "Influencer's Apples"]], 16, "Gold Blocks", "GOLD_BLOCK"),
    ]),
    shop("Reddit Master", "-153, 77, 62", [
      trade([[1, "Redditor's Shroom"]], 5, "Gold Ingots", "GOLD_INGOT"),
      trade(
        [[7, "Redditor's Shrooms"]],
        1,
        "Blast Protection IV Book",
        "ENCHANTED_BOOK",
      ),
      trade(
        [[6, "Redditor's Shrooms"]],
        1,
        "Protection IV Book",
        "ENCHANTED_BOOK",
      ),
      trade(
        [[5, "Redditor's Shrooms"]],
        1,
        "Depth Strider III Book",
        "ENCHANTED_BOOK",
      ),
      trade(
        [[5, "Redditor's Shrooms"]],
        1,
        "Frost Walker II Book",
        "ENCHANTED_BOOK",
      ),
    ]),
    shop(
      "Nether Shop",
      "5, 77, 2",
      [
        trade(
          [
            [2, "Playtime Certificates"],
            [1, "Netherite Ingot", "NETHERITE_INGOT"],
          ],
          1,
          "Wither Skeleton Skull",
          "WITHER_SKELETON_SKULL",
        ),
        trade(
          [emerald(16), [8, "Nether Quartz", "QUARTZ"]],
          12,
          "Gunpowder",
          "GUNPOWDER",
        ),
        trade([diamond(8), iron(2)], 8, "Fire Charges", "FIRE_CHARGE"),
        trade([emerald(48), diamond(2)], 8, "Blaze Rods", "BLAZE_ROD"),
        trade([emerald(48), gold(3)], 2, "Ghast Tears", "GHAST_TEAR"),
        trade([emerald(8), iron(2)], 16, "Glowstone Blocks", "GLOWSTONE"),
        trade([emerald(1), iron(1)], 16, "Netherrack", "NETHERRACK"),
        trade([emerald(4), iron(2)], 16, "Soul Sand", "SOUL_SAND"),
      ],
      "world_nether",
    ),
    shop("Cobbletown Totem Shop", "-21, 67, -164", [
      trade(
        [[64, "Gold Blocks", "GOLD_BLOCK"], diamond(32)],
        12,
        "Bulk Totem Vouchers",
      ),
      trade(
        [[8, "Gold Blocks", "GOLD_BLOCK"], diamond(4)],
        1,
        "Totem of Undying",
        "TOTEM_OF_UNDYING",
      ),
      trade(
        [[1, "Bulk Totem Voucher"]],
        1,
        "Totem of Undying",
        "TOTEM_OF_UNDYING",
      ),
    ]),
  ];
})();
