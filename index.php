<?php

$autosave = true;
$sound = true;
$on_vr_headset = !!(preg_match("#Oculus#i", $_SERVER['HTTP_USER_AGENT']));
//$remote_logging_enabled = $on_vr_headset;
$remote_logging_enabled = true;
$console_log_prefix = "console";
$save_dir = "saves";
$logs_dir = "logs";

$parts = pathinfo($_SERVER['SCRIPT_FILENAME']);
$base_path = $parts['dirname'];
if (!file_exists($base_path)) {
    throw new Exception("Can't find base path " . $base_path);
}

//$cachebust = time();
$cachebust = 1;
$cachebust = md5($cachebust);

// start new world
if (isset($_REQUEST['new'])) {
    $parts = parse_url($_SERVER['REQUEST_URI']);
    $path = $parts['path'];
    setcookie("gameid", null, time() - 3600);
    header("Location: " . $path);
    exit;
}

if (!isset($_COOKIE['gameid'])) {
    $gameid = uniqid();
}
else {
    $gameid = $_COOKIE['gameid'];
}
setcookie("gameid", $gameid, time() + (86400 * 365));
$save_file = "savefile-" . $gameid;

// ajax
if (isset($_REQUEST['save']) && $_REQUEST['save']) {
    file_put_contents($base_path . "/" . $save_dir . "/" . $save_file, $_REQUEST['save']);
    exit;
}
if (isset($_REQUEST['log']) && $_REQUEST['log']) {
    $log = $_REQUEST['log'];
    $log = json_decode($_REQUEST['log'], true);
    foreach ($log['log_msgs'] as $log_msg) {
        $log_msg = date("Y-m-d H:i:s") . "\t" . $gameid . "\t" . $log_msg;
        $log_file = $base_path . "/" . $logs_dir . "/" . $console_log_prefix . "_" . date("Ym") . ".log";
        error_log($log_msg . "\n", 3, $log_file);
    }
    exit;
}
// end ajax


$saved_game = false;
if (file_exists($base_path . "/" . $save_dir . "/" . $save_file)) {
    $saved_game = file_get_contents($base_path . "/" . $save_dir . "/" . $save_file);
    if ($saved_game) {
        $saved_game = json_decode($saved_game, true);
    } else {
        $saved_game = false;
    }
}

$item_types_config = file_get_contents("item_types_config.json");
$item_types_config = json_decode($item_types_config, true);

$materials_config = file_get_contents("materials_config.json");
$materials_config = json_decode($materials_config, true);

print '<!DOCTYPE html>';
print '
<html lang="en">
<head>
<title>Block World</title>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="main.css?v=' . $cachebust . '" type="text/css" />
<script type="importmap">
{
    "imports": {"three": "https://unpkg.com/three@0.138.3/build/three.module.js"}
}
</script>
<script type="module" src="main.js?v=' . $cachebust . '"></script>
</head>
<body>
<a id="clear_map" href=".?new">CLEAR MAP</a>
';

$options = array(
    "on_vr_headset" => $on_vr_headset,
    "materials_config" => $materials_config,
    "item_types_config" => $item_types_config,
    "remote_logging_enabled" => $remote_logging_enabled,
    "autosave" => $autosave,
    "sound" => $sound,
);
if ($saved_game) {
    $options['saved_game'] = $saved_game;
}

print '<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script>';
print '
<script>
var options = ' . json_encode($options) . ';
</script>
</body>
</html>
';
