<?php
// types:
// basic = MeshBasicMaterial
// phong = MeshPhongMaterial

$generic_colors = array(
    "00FF00",
    "FF0000",
    "0000FF",
    "00FFFF",
    "FFFF00",
    "FF00FF",
    "FCBA03",
    "FF17CD",
    "000000",
    "FFFFFF",
);

$generic_textures = array(
    "dirt.png",
    "grass.png",
    "brick.png",
    "bark1.png",
    "bark2.png",
    "wood.png",
    "wood2.png",
    "planks.png",
    "planks2.png",
    "marble.png",
    "metal.png",
    "fabric1.png",
    "fabric2.png",
    "fabric3.png",
    "leather.png",
    "coins.png",
    "marble2.png",
    "marble3.png",
    "redlines.png",
    "grill.png",
);

$geometries = array(
    1,
    2,
    3,
);



$custom_materials = array(

    "leaves" => array(
        'type' => 'basic',
        'params' => array(
            'url' => "leaves.png",
            "transparent" => true,
        ),
    ),
    "leaves_thin" => array(
        'type' => 'basic',
        'params' => array(
            'url' => "leaves_thin.png",
            "transparent" => true,
        ),
    ),
    "leaves_thin2" => array(
        'type' => 'basic',
        'params' => array(
            'url' => "leaves_thin2.png",
            "transparent" => true,
        ),
    ),

    "water" => array(
        'type' => 'basic',
        'params' => array(
            'url' => "water.png",
            "transparent" => true,
            "opacity" => 0.5,
        ),
    ),
    "water2" => array(
        'type' => 'basic',
        'params' => array(
            'url' => "water2.png",
            "transparent" => true,
            "opacity" => 0.5,
        ),
    ),
    "grass_dirt" => array(
        'type' => 'basic',
        'params' => array(
            'url' => "grass_dirt.png"
        ),
    ),
    "door" => array(
        'type' => 'basic',
        'params' => array(
            'url' => "door.png"
        ),
    ),
    "fur" => array(
        'type' => 'basic',
        'params' => array(
            'url' => "fur.png"
        ),
    ),
    "pua" => array(
        'type' => 'basic',
        'params' => array(
            'url' => "pua.png"
        ),
    ),
    "dark_fur" => array(
        'type' => 'basic',
        'params' => array(
            'url' => "dark_fur.png"
        ),
    ),
    "wolf" => array(
        'type' => 'basic',
        'params' => array(
            'url' => "wolf.png"
        ),
    ),
    "green_frame" => array(
        'type' => 'basic',
        'params' => array(
            'url' => "green_frame.png"
        ),
    ),
    "1" => array(
        'type' => 'basic',
        'params' => array(
            'url' => "1.png"
        ),
    ),
    "2" => array(
        'type' => 'basic',
        'params' => array(
            'url' => "2.png"
        ),
    ),
    "3" => array(
        'type' => 'basic',
        'params' => array(
            'url' => "3.png"
        ),
    ),
    "4" => array(
        'type' => 'basic',
        'params' => array(
            'url' => "4.png"
        ),
    ),
    "5" => array(
        'type' => 'basic',
        'params' => array(
            'url' => "5.png"
        ),
    ),
    "6" => array(
        'type' => 'basic',
        'params' => array(
            'url' => "6.png"
        ),
    ),
    'transparent' => array(
        'type' => 'basic',
        'params' => array(
            'visible' => false,
        ),
    ),
);

$custom_block_types = array(
    array(
        'id' => 201,
        'geometry_id' => '1',
        'sides' => array(
            "grass_dirt",
            "grass_dirt",
            "grass",
            "dirt",
            "grass_dirt",
            "grass_dirt",
        ),
    ),
    array(
        'geometry_id' => '1',
        'sides' => array(
            "leaves",
        ),
    ),
    array(
        'geometry_id' => '1',
        'sides' => array(
            "leaves_thin",
        ),
    ),
    array(
        'geometry_id' => '1',
        'sides' => array(
            "leaves_thin2",
        ),
    ),
    array(
        'geometry_id' => '2',
        'sides' => array(
            "leaves",
        ),
    ),
    array(
        'geometry_id' => '2',
        'sides' => array(
            "leaves_thin",
        ),
    ),
    array(
        'geometry_id' => '2',
        'sides' => array(
            "leaves_thin2",
        ),
    ),
    array(
        'geometry_id' => '1',
        'sides' => array(
            "water",
        ),
    ),
    array(
        'geometry_id' => '1',
        'sides' => array(
            "water2",
        ),
    ),
    array(
        'geometry_id' => '1',
        'sides' => array(
            "door",
        ),
    ),
    array(
        'geometry_id' => '1',
        'sides' => array(
            "fur",
            "fur",
            "fur",
            "fur",
            "pua",
            "pua",
        ),
    ),
    array(
        'geometry_id' => '1',
        'sides' => array(
            "dark_fur",
            "dark_fur",
            "dark_fur",
            "dark_fur",
            "wolf",
            "wolf",
        ),
    ),
    array(
        'geometry_id' => '1',
        'sides' => array(
            "green_frame",
        ),
    ),
    array(
        'id' => 200,
        'geometry_id' => '1',
        'sides' => array("1","2","3","4","5","6"),
    ),

    array(
        'id' => 202,
        'geometry_id' => '1',
        'sides' => array(
            "transparent",
            "transparent",
            "grass",
            "transparent",
            "transparent",
            "transparent",
        ),
    ),

);


$item_types_config = array();

$materials_config = array();
$material_iden_to_id = array();
$id = 1;
foreach ($generic_colors as $color) {
    $materials_config[$id] = array(
        'type' => 'phong',
        'params' => array(
            'color' => "#" . $color
        ),
    );
    $material_iden_to_id[$color] = $id;
    $id++;
}
foreach ($generic_textures as $texture) {
    list($material_iden, $ext) = explode(".", $texture);
    $materials_config[$id] = array(
        'type' => 'basic',
        'params' => array(
            'url' => $texture
        ),
    );
    $material_iden_to_id[$material_iden] = $id;
    $id++;
}
foreach ($custom_materials as $iden => $material_config) {
    $materials_config[$id] = $material_config;
    $material_iden_to_id[$iden] = $id;
    $id++;
}

$item_types_config = array();
$id = 1;
foreach ($geometries as $geometry_id) {
    foreach ($generic_colors as $material_iden) {
        $item_types_config[] = array(
            'id' => $id,
            'geometry_id' => $geometry_id,
            'sides' => array(
                $material_iden_to_id[$material_iden],
            ),
        );
        $id++;
    }
    foreach ($generic_textures as $texture) {
        list($material_iden, $ext) = explode(".", $texture);
        $item_types_config[] = array(
            'id' => $id,
            'geometry_id' => $geometry_id,
            'sides' => array(
                $material_iden_to_id[$material_iden],
            ),
        );
        $id++;
    }
}
foreach ($custom_block_types as $custom_block_type) {
    if (!isset($custom_block_type['id']) || !$custom_block_type['id']) {
        $custom_block_type['id'] = $id;
    }
    foreach ($custom_block_type['sides'] as $i => $material_iden) {
        if (!isset($material_iden_to_id[$material_iden])) {
            throw new Exception("unknown material identifier " . $material_iden);
        }
        $custom_block_type['sides'][$i] = $material_iden_to_id[$material_iden];
    }
    $item_types_config[] = $custom_block_type;
    $id++;
}

$num_sides_per_geometry = array(
    1 => 6, // box
    2 => 5, // angle45
    3 => 1, // sphere
);

foreach (array_keys($item_types_config) as $i) {
    if (
        count($item_types_config[$i]['sides']) === 1
        && $num_sides_per_geometry[$item_types_config[$i]['geometry_id']] !== 1
    ) {
        for ($n = 1; $n < $num_sides_per_geometry[$item_types_config[$i]['geometry_id']]; $n++) {
            $item_types_config[$i]['sides'][] = $item_types_config[$i]['sides'][0];
        }
    }
}

file_put_contents("item_types_config.json", json_encode($item_types_config, JSON_PRETTY_PRINT));
file_put_contents("materials_config.json", json_encode($materials_config, JSON_PRETTY_PRINT));

