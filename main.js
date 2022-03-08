import * as THREE from "three";
import { VRButton } from 'https://unpkg.com/three@0.138.3/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'https://unpkg.com/three@0.138.3/examples/jsm/webxr/XRControllerModelFactory.js';

(function($) {
    
    class Game {
        
        static options;
        static renderer;
        static scene;
    
        // play = playing
        // inventory = picking from inventory
        static state = "play";
        
        static config = {
            on_vr_headset: false,
            max_fps: 100,

            // speed, blocks per second
            player_speed: 3,

            fov_far: 1000,
            assets_dir: 'assets',
            
            ajax_url: ".",
            saved_game: false,
    
            remote_logging_enabled: false,
            
            autosave: true,
            
            sound: true,
            
            materials_config: null,
            item_types_config: null,
    
            // space_between_items: 0.1,
            space_between_items: 0.0002,
    
            allow_stick_rotation_control: false,
            
            
        }
        
        static run(options) {
    
            try {

                if (typeof options === "object"){
                    for (const option_iden in options) {
                        Game.config[option_iden] = options[option_iden];
                    }
                }
    
                Game.log("starting game");
    
                Game.renderer = new THREE.WebGLRenderer({
                    antialias: true,
                    alpha: true,
                });
                Game.renderer.setSize(window.innerWidth, window.innerHeight);
                Game.renderer.xr.enabled = true;
                Game.renderer.xr.setReferenceSpaceType('local');
                Game.scene = new THREE.Scene();
    
                document.body.appendChild(Game.renderer.domElement);
                document.body.appendChild(VRButton.createButton(Game.renderer));
    
                // this stuff needs to be preloaded
                Sounds.init();
                Player.init();
                World.init();
                Controls.init();
                Keyboard.init();
                Game.load();
    
                Game.renderer.setAnimationLoop(Game.render);
    
                Game.renderer.xr.addEventListener('sessionstart', Game.on_start_xr_session);
                Game.renderer.xr.addEventListener('sessionend', Game.on_end_xr_session);
    
            }
            catch (err) {
                Game.handle_error(err);
            }
    
        }

        static on_start_xr_session() {
            try {
                Game.log("xr session started");
                $("#clear_map").hide();
                World.hide();
                setTimeout(
                    function() {
                        let a = Headset.get_world_horizontal_rotation_angle();
                        let diff = Utils.get_horizontal_rotation_angle(Player.group) - a;
                        Player.group.rotateY(diff);
                        World.show();
                    },
                    50
                );

            }
            catch (err) {
                Game.handle_error(err);
            }
        }
    
        static on_end_xr_session() {
            Game.log("xr session ended");
            $("#clear_map").show();
            setTimeout(
                function() {
                    let a = Headset.get_world_horizontal_rotation_angle();
                    let gr = Utils.get_horizontal_rotation_angle(Player.group) - a;
                    Player.group.rotateY(0 - a - gr);
                    World.show();
                },
                50
            );
        }
        
        static render() {
            try {
                Game.tick();
                Game.renderer.render(Game.scene, Player.camera);
            }
            catch (err) {
                Game.handle_error(err);
            }
        }
    
        static clock = new THREE.Clock();
        
        static tick() {
            if ( typeof Game.tick.last_time === "undefined" ) {
                Game.tick.last_time = Game.clock.getElapsedTime();
                Game.tick.min_interval = 1/Game.config.max_fps;
                return;
            }
            
            let current_time = Game.clock.getElapsedTime();
            let interval_length = current_time - Game.tick.last_time;
            if (interval_length < Game.tick.min_interval) {
                return;
            }
            Game.tick.last_time = current_time;
            
            Player.move();
            World.move();
            Controls.poll();
            SelectBlockControlPanel.animate();
        }
    
        static log(msg) {
            console.log(msg);
            Game.log_remote(msg);
        }

        static handle_error(err) {
            err = "" + err.stack;
            if (Game.config.remote_logging_enabled) {
                Game._send_remote_log_msgs([err]);
            }
            throw (err);
        }
        
        static remote_log_queue = [];
        static log_remote(msg) {
    
            if (!Game.config.remote_logging_enabled) {
                return;
            }
            
            if (Game.remote_log_queue.length > 100) {
                console.log("remote log queue full, not sending");
                return;
            }
            Game.remote_log_queue.push(msg);
            Game.send_remote_log_queue(false);
    
        }
    
        static remote_log_in_process = false;
        static send_remote_log_queue(force_send) {
            if (!force_send && Game.remote_log_in_process) {
                return;
            }
            
            Game.remote_log_in_process = true;
    
            // console.log("sending remote log queue");
    
            let log_msgs = Game.remote_log_queue;
            Game.remote_log_queue = [];
            Game._send_remote_log_msgs(log_msgs, function() {
                setTimeout(
                    function() {
                        if (Game.remote_log_queue.length) {
                            Game.send_remote_log_queue(true);
                        }
                        else {
                            Game.remote_log_in_process = false;
                        }
                    },
                    1000
                );
            });
        }
        
        static _send_remote_log_msgs(log_msgs, callback){
            // console.log("sending remote message");
            let complete_cb = function() {
                if (callback) {
                    callback();
                }
            }

            $.ajax({
                type: 'POST',
                url: Game.config.ajax_url,
                data: {log: JSON.stringify({log_msgs: log_msgs})},
                complete: complete_cb,
                error: complete_cb
            });
        }
    
    
        static saving = false;
        static save_pending = false;
    
        static save() {
        
            if (!Game.config.autosave) {
                return;
            }
            
            if (!World.items_group.children.length) {
                return;
            }
            
            if (Game.saving) {
                Game.save_pending = true;
                return;
            }
            Game.saving = true;
    
            var world = [];
            for (let i = 0; i < World.items_group.children.length; i++) {
                let item = World.items_group.children[i];
                world.push([
                    item.position.x,
                    item.position.y,
                    item.position.z,
                    item.rotation.x,
                    item.rotation.y,
                    item.rotation.z,
                    item.userData.block_type_identifier
                ]);
            }

            let game_data = {
                player_position: {
                    x: Player.group.position.x,
                    y: Player.group.position.y,
                    z: Player.group.position.z,
                    r: Headset.get_world_horizontal_rotation_angle(),
                },
                world: world
            };
    
            let complete_cb = function() {
                Game.saving = false;
                if (Game.save_pending) {
                    Game.save_pending = false;
                    Game.save();
                }
            }
            
            $.ajax({
                type: 'POST',
                url: Game.config.ajax_url,
                data: {save: JSON.stringify(game_data)},
                // dataType: "json",
                complete: complete_cb,
                error: complete_cb
            });
        
        }
        
        static load() {
    
            let game_data;
            let player_position;
            if (Game.config.saved_game) {
                player_position = Game.config.saved_game.player_position;
                game_data = Game.config.saved_game.world;
            }
            else {
                player_position = {
                    x:1,
                    y:1,
                    z:4,
                    r:Math.PI / 16
                };
                game_data = [];

                game_data.push([0, 0, 0, 0, 0, 0, 201]);

            }

            Player.group.position.set(
                parseFloat(player_position.x),
                parseFloat(player_position.y),
                parseFloat(player_position.z),
            );
    
            Player.group.rotateY(player_position.r);
            
            for (let i = 0; i < game_data.length; i++) {
                let cell = game_data[i];
                World.add_item(
                    parseFloat(cell[0]),
                    parseFloat(cell[1]),
                    parseFloat(cell[2]),
                    parseFloat(cell[3]),
                    parseFloat(cell[4]),
                    parseFloat(cell[5]),
                    cell[6]
                );
            }

            
        }
        
    }
    
    class Player {
    
        static camera;
        
        // used so the mouse can move the camera
        static camera_container;

        // group of things that should move with the player
        static group;

        static radius = 0.75;
        
        static init() {
    
            Player.camera = new THREE.PerspectiveCamera(
                55, // fov
                window.innerWidth / window.innerHeight,
                0.1, // near
                Game.config.fov_far // far
            );
            Player.camera.aspect = window.innerWidth / window.innerHeight;
            Player.camera.name = "camera";
            
            let player_position = {
                x: 0,
                y: 0,
                z: 0,
                // r: -1,
            };

            Player.group = new THREE.Group();
            Player.group.name = "player_group";
    
            Player.group.add(Player.camera);
            
            Game.scene.add(Player.group);

            Controls.add_event_listener(
                "onMouseLeftClick",
                function(event) {
                    if (SelectBlockControlPanel.visible) {
                        let targeted_item_info = Controls.get_info_of_object_targeted_by_mouse(event.clientX, event.clientY, SelectBlockControlPanel.panel_group);
                        SelectBlockControlPanel.select_item(targeted_item_info);
                    }
                    else {
                        let targeted_item_info = Controls.get_info_of_object_targeted_by_mouse(event.clientX, event.clientY, World.items_group);
                        Player.place_item(targeted_item_info);
                    }
                }
            );
            Controls.add_event_listener(
                "onMouseRightClick",
                function(event) {
                    if (!SelectBlockControlPanel.visible) {
                        let targeted_item_info = Controls.get_info_of_object_targeted_by_mouse(event.clientX, event.clientY, World.items_group);
                        Player.remove_item(targeted_item_info);
                    }
                }
            );
            Controls.add_event_listener(
                "onRightTriggerPressed",
                function(event) {
                    if (SelectBlockControlPanel.visible) {
                        SelectBlockControlPanel.select_item();
                    }
                    else {
                        let targeted_item_info = Controls.get_info_of_object_targeted_by_xr_controller(event.controller, World.items_group)
                        if (targeted_item_info) {
                            Player.place_item(targeted_item_info);
                        }
                    }
                }
            );
            Controls.add_event_listener(
                "onRightSqueezePressed",
                function(event) {
                    if (!SelectBlockControlPanel.visible) {
                        let targeted_item_info = Controls.get_info_of_object_targeted_by_xr_controller(event.controller, World.items_group)
                        if (targeted_item_info) {
                            Player.remove_item(targeted_item_info);
                        }
                    }
                }
            );
            Controls.add_event_listener(
                "onRightButtonAPressed",
                function(event) {
                    SelectBlockControlPanel.toggle();
                }
            );
            Controls.add_event_listener(
                "onRightStickChanged",
                function(event) {
                    if (!SelectBlockControlPanel.visible) {
                        Player.change_sideways_velocity(event.value.x);
                        Player.change_forward_velocity(event.value.y);
                    }
                }
            );
            Controls.add_event_listener(
                "onLeftStickChanged",
                function(event) {
                    if (!SelectBlockControlPanel.visible) {
                        // up and down
                        Player.change_verticle_velocity(0 - event.value.y);
    
                        // rotate right or left
                        if (Game.config.allow_stick_rotation_control) {
                            Player.change_rotation_velocity(event.value.x);
                        }
                    }
                }
            );
    
            Controls.add_event_listener(
                "onMouseMove",
                function(event) {
                    if (SelectBlockControlPanel.visible) {
                        let targeted_item_info = Controls.get_info_of_object_targeted_by_mouse(event.clientX, event.clientY, SelectBlockControlPanel.panel_group);
                        if (targeted_item_info) {
                            SelectBlockControlPanel.set_targeted_item(targeted_item_info.object);
                        } else {
                            SelectBlockControlPanel.clear_targeted_item();
                        }
                    }
                    else {
                        let targeted_item_info = Controls.get_info_of_object_targeted_by_mouse(event.clientX, event.clientY, World.items_group);
                        if (targeted_item_info) {
                            World.set_targeted_item(targeted_item_info.object);
                        } else {
                            World.clear_targeted_item();
                        }
                    }
                }
            );
    
            Controls.add_event_listener(
                "onControllerMove",
                function(event) {
                    if (event.controller.userData.handedness === "right") {
                        if (SelectBlockControlPanel.visible) {
                            let targeted_item_info = Controls.get_info_of_object_targeted_by_xr_controller(event.controller, SelectBlockControlPanel.panel_group);
                            if (targeted_item_info) {
                                SelectBlockControlPanel.set_targeted_item(targeted_item_info.object);
                            } else {
                                SelectBlockControlPanel.clear_targeted_item();
                            }
                        }
                        else {
                            let targeted_item_info = Controls.get_info_of_object_targeted_by_xr_controller(event.controller, World.items_group);
                            if (targeted_item_info) {
                                World.set_targeted_item(targeted_item_info.object);
                            } else {
                                World.clear_targeted_item();
                            }
                        }
                    }
                }
            );
        
        }
    
        static target_velocity = {
            sideways: 0,
            forward: 0,
            verticle: 0,
            rotation: 0,
        }
    
        static actual_velocity = {
            sideways: 0,
            forward: 0,
            verticle: 0,
            rotation: 0,
        }
       
        static old_move() {
    
            let current_time = Date.now();
            if ( typeof Player.move.last_move_time === "undefined" ) {
                Player.move.last_move_time = current_time;
                Player.move.is_moving = false;
                Player.move.direction_space = new THREE.Object3D();
                return;
            }
    
            let interval_length = (current_time - Player.move.last_move_time) / 1000;
            Player.move.last_move_time = current_time;
        
            let acceleration_factor = interval_length * (Game.config.player_speed * 0.5);
            let speed_factor = interval_length * Game.config.player_speed;
        
            // change velocity
            (["x", "y", "z", "rotation"]).forEach(function (dir) {
                if (Player.actual_velocity[dir] === Player.target_velocity[dir]) {
                    return;
                }
                if (
                    Player.actual_velocity[dir] > Player.target_velocity[dir]
                ) {
                    Player.actual_velocity[dir] -= acceleration_factor;
                    if (Player.actual_velocity[dir] < Player.target_velocity[dir]) {
                        Player.actual_velocity[dir] = Player.target_velocity[dir];
                    }
                }
                if (
                    Player.actual_velocity[dir] < Player.target_velocity[dir]
                ) {
                    Player.actual_velocity[dir] += acceleration_factor;
                    if (Player.actual_velocity[dir] > Player.target_velocity[dir]) {
                        Player.actual_velocity[dir] = Player.target_velocity[dir];
                    }
                }
            });
        
            if (
                Player.actual_velocity.x
                || Player.actual_velocity.y
                || Player.actual_velocity.z
                || Player.actual_velocity.rotation
            ) {
                Player.move.is_moving = true;
                let camera_direction = Headset.get_world_direction();
                let attachment_point = Player.move.direction_space;

                let x_increment;
                let z_increment;
                x_increment = 0 - camera_direction.z * speed_factor * Player.actual_velocity.x;
                x_increment = x_increment - camera_direction.x * speed_factor * Player.actual_velocity.z;
                z_increment = camera_direction.x * speed_factor * Player.actual_velocity.x;
                z_increment = z_increment - camera_direction.z * speed_factor * Player.actual_velocity.z;

                
                // Player.group.add(attachment_point);
                // attachment_point.position.set(0,0,0);
                // attachment_point.position.x += x_increment;
                // attachment_point.position.z += z_increment;
                // Game.scene.attach(attachment_point);
                // if (!World.intersects_item(201, attachment_point)) {
                    Player.group.position.x += x_increment;
                    Player.group.position.z += z_increment;
                // }
                // else {
                //     Player.actual_velocity.x = 0;
                //     Player.target_velocity.x = 0;
                //     Player.actual_velocity.z = 0;
                //     Player.target_velocity.z = 0;
                // }
    
                // Player.group.position.x -= camera_direction.z * speed_factor * Player.actual_velocity.x;
                // Player.group.position.x -= camera_direction.x * speed_factor * Player.actual_velocity.z;
                // Player.group.position.z += camera_direction.x * speed_factor * Player.actual_velocity.x;
                // Player.group.position.z -= camera_direction.z * speed_factor * Player.actual_velocity.z;
    
                // up and down
                // Player.group.add(attachment_point);
                // attachment_point.position.set(0,0,0);
                // attachment_point.position.y += speed_factor * Player.actual_velocity.y;
                // Game.scene.attach(attachment_point);
                // if (!World.intersects_item(201, attachment_point)) {
                    Player.group.position.y += speed_factor * Player.actual_velocity.y;
                // }
                // else {
                //     Player.actual_velocity.y = 0;
                //     Player.target_velocity.y = 0;
                // }
                
                
                // rotation
                let rotation_amount = 0 - THREE.Math.degToRad(Player.actual_velocity.rotation) * speed_factor * 20;
                if (rotation_amount) {
                    Player.group.rotateY(rotation_amount);
                }
                
            }
            else {
                if (Player.move.is_moving) {
                    Player.move.is_moving = false;
                    Game.save();
                }
            }
        }
    
        static move() {
            let current_time = Date.now();
            if ( typeof Player.move.last_move_time === "undefined" ) {
                Player.move.last_move_time = current_time;
                Player.move.is_moving = false;
                Player.move.direction_space = new THREE.Object3D();
                Player.move.scratch_point = new THREE.Vector3();
                return;
            }
    
            let interval_length = (current_time - Player.move.last_move_time) / 1000;
            Player.move.last_move_time = current_time;
    
            let acceleration_factor = interval_length * (Game.config.player_speed * 1.1);
            let speed_factor = interval_length * Game.config.player_speed;
    
            // change velocity
            (["sideways", "verticle", "forward", "rotation"]).forEach(function (dir) {
                if (Player.actual_velocity[dir] === Player.target_velocity[dir]) {
                    return;
                }
                if (
                    Player.actual_velocity[dir] > Player.target_velocity[dir]
                ) {
                    Player.actual_velocity[dir] -= acceleration_factor;
                    if (Player.actual_velocity[dir] < Player.target_velocity[dir]) {
                        Player.actual_velocity[dir] = Player.target_velocity[dir];
                    }
                }
                if (
                    Player.actual_velocity[dir] < Player.target_velocity[dir]
                ) {
                    Player.actual_velocity[dir] += acceleration_factor;
                    if (Player.actual_velocity[dir] > Player.target_velocity[dir]) {
                        Player.actual_velocity[dir] = Player.target_velocity[dir];
                    }
                }
            });
    
    
    
            let sideways_velocity = Player.actual_velocity.sideways;
            let forward_velocity = Player.actual_velocity.forward;
            let verticle_velocity = Player.actual_velocity.verticle;
            let rotation_velocity = Player.actual_velocity.rotation;
    
            if (
                forward_velocity
                || sideways_velocity
                || verticle_velocity
                || rotation_velocity
            ) {
                Player.move.is_moving = true;
                let camera_direction = Headset.get_world_direction();
    
                let x_increment = 0;
                let z_increment = 0;
                let y_increment = 0;
    
                x_increment -= camera_direction.x * speed_factor * forward_velocity;
                z_increment -= camera_direction.z * speed_factor * forward_velocity;

                x_increment -= (camera_direction.z * speed_factor * sideways_velocity);
                z_increment += camera_direction.x * speed_factor * sideways_velocity;
   
                y_increment += speed_factor * verticle_velocity;
                
                
                
                // TODO: all the below commented code is attempts to make the player not move through walls,
                // as well as slide either left or right along a wall they have run into.
                // Needs to be fleshed out and completed.
                
                // if (x_increment || z_increment) {
                //     if (typeof Player.move.raycaster === "undefined") {
                //
                //         Player.move.direction_group = new THREE.Group();
                //         Player.move.direction_group.name = "direction_group";
                //
                //         // Player.reference_frame = new THREE.Object3D()
                //         Player.move.forward_point = new THREE.Mesh(new THREE.BoxBufferGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({color: 0xFF0000}));
                //
                //         // raycaster
                //         Player.move.raycaster = new THREE.Raycaster();
                //         // Player.move.raycaster.far = 2;
                //
                //         // arrow
                //         Player.move.arrow = new THREE.ArrowHelper();
                //         Player.move.arrow.headWidth = 0;
                //         Player.move.arrow.headLength = 0;
                //         Game.scene.add(Player.move.arrow);
                //
                //         Player.move.forward_direction = new THREE.Vector3();
                //         Player.move.distance = new THREE.Vector3();
                //
                //     }
                //
                //     let direction_group = Player.move.direction_group;
                //     let forward_point = Player.move.forward_point;
                //     let raycaster = Player.move.raycaster;
                //     let arrow = Player.move.arrow;
                //     let forward_direction = Player.move.forward_direction;
                //     let distance = Player.move.distance;
                //
                //     Game.scene.add(forward_point);
                //     forward_point.position.set(Player.group.position.x + x_increment, 0, Player.group.position.z + z_increment);
                //
                //     forward_direction.set(x_increment, 0, z_increment);
                //     // distance = forward_direction.length();
                //
                //     // world direction we are moving
                //     forward_direction.normalize();
                //
                //     // world horizontal rotation angle from 0 of the forward direction
                //     let world_forward_angle = Utils.get_horizontal_rotation_angle(forward_direction);
                //
                //     // get direction to point raycaster in towards front right point
                //
                //     // point raycaster -45 deg to right to check that right forward point
                //     let direction_to_front_right = Utils.get_horizontal_direction_vector(world_forward_angle - (Math.PI / 4));
                //
                //     // direction_group.add(forward_point);
                //     // forward_point.position.set(0, 0, 0 - Player.radius);
                //
                //
                //
                //
                //     // make the forward point a world point
                //     // Game.scene.attach(forward_point);
                //
                //     // raycaster starts at that point in front of our movement direction, and goes in movement direction
                //
                //     // TODO adjust up or down y axis to check different heights.. right now its just at eye level
                //     raycaster.set(Player.group.position, direction_to_front_right);
                //     raycaster.far = Player.radius;
                //
                //     arrow.position.copy(raycaster.ray.origin);
                //     arrow.setDirection(raycaster.ray.direction);
                //     arrow.setLength(raycaster.far);
                //
                //     let intersects = raycaster.intersectObjects(World.items_group.children, false);
                //     if (intersects.length) {
                //
                //         // x_increment = intersects[0].point.x - Player.group.position.x;
                //         // x_increment *= (0.9999);
                //         // z_increment = intersects[0].point.z - Player.group.position.z;
                //         // z_increment *= (0.9999);
                //         //
                //         // console.log(x_increment + ", " + z_increment)
                //         // forward_point.position.x = Player.group.position.x + x_increment;
                //         // forward_point.position.z = Player.group.position.z + z_increment;
                //
                //         let normal = intersects[0].face.normal;
                //         let object = intersects[0].object;
                //         var normalMatrix = new THREE.Matrix3().getNormalMatrix( object.matrixWorld );
                //         let wnormal = normal.clone().applyMatrix3( normalMatrix ).normalize();
                //         let whr = Utils.get_horizontal_rotation_angle(wnormal);
                //         // Game.log( whr);
                //         // Game.log(wnormal);
                //
                //         // rotate our forward_point by 45 deg to the left, to avoid the wall found on the front right
                //         Player.group.add(direction_group);
                //         direction_group.position.set(0,0,0);
                //         Game.scene.attach(direction_group);
                //         direction_group.rotation.set(0,0,0);
                //         direction_group.rotateY(world_forward_angle - (Math.PI / 4));
                //         direction_group.attach(forward_point);
                //
                //         Game.log("distance: " + intersects[0]['distance']);
                //         direction_group.z += Player.radius - intersects[0]['distance'];
                //         direction_group.rotateY(Math.PI / 4);
                //
                //         direction_group.rotateY(whr - (Math.PI / 4));
                //         Game.scene.attach(forward_point);
                //
                //         // now only move to where an intersect occurs, if we're still close
                //         // x_increment = forward_point.position.x - Player.group.position.x;
                //         // z_increment = forward_point.position.z - Player.group.position.z;
                //         // forward_direction.set(x_increment, 0, z_increment);
                //         // forward_direction.normalize();
                //         //
                //         // raycaster.set(Player.group.position, forward_direction);
                //         // raycaster.far = Player.radius;
                //         // let intersects = raycaster.intersectObjects(World.items_group.children, false);
                //         // if (intersects.length) {
                //         //     // Game.log(intersects[0]);
                //         //     x_increment = intersects[0].point.x - Player.group.position.x;
                //         //     x_increment *= (0.9999);
                //         //     y_increment = intersects[0].point.y - Player.group.position.y;
                //         //     y_increment *= (0.9999);
                //         //
                //         //     forward_point.position.x = Player.group.position.x + x_increment;
                //         //     forward_point.position.z = Player.group.position.z + y_increment;
                //         // }
                //
                //         // let normal = intersects[0].face.normal;
                //         // let object = intersects[0].object;
                //         // var normalMatrix = new THREE.Matrix3().getNormalMatrix( object.matrixWorld );
                //         // let wnormal = normal.clone().applyMatrix3( normalMatrix ).normalize();
                //         // let whr = Utils.get_horizontal_rotation_angle(wnormal);
                //         // Game.log( whr);
                //         // // Game.log(wnormal);
                //
                //         // collision occurred between forward point and destination point
                //         // console.log(intersects[0]);
                //         // console.log(Utils.get_xyz_string(intersects[0].point, null));
                //         // console.log(Utils.get_xyz_string(forward_point.position, null));
                //         // // console.log(forward_point - );
                //         // console.log("max intersect:");
                //         // console.log(forward_point.position.x - intersects[0].point.x);
                //         // console.log(forward_point.position.z - intersects[0].point.z);
                //
                //         // x_increment = 0;
                //         // z_increment = 0;
                //         // x_increment = (forward_point.position.x - intersects[0].point.x);
                //         // z_increment = (forward_point.position.z - intersects[0].point.z);
                // //         console.log("stopped");
                //     }
                // //
                // //     // now check for inside object, in which case we can't move any direction I guess:
                // //
                //
                //
                //     Player.group.position.x = forward_point.position.x;
                //     Player.group.position.z = forward_point.position.z;
                //
                // }
                
                Player.group.position.x += x_increment;
                Player.group.position.z += z_increment;
                Player.group.position.y += y_increment;

                let rotation_amount = 0 - THREE.Math.degToRad(rotation_velocity) * speed_factor * 20;
                if (rotation_amount) {
                    Player.group.rotateY(rotation_amount);
                }
    
    
            }
            else {
                if (Player.move.is_moving) {
                    Player.move.is_moving = false;
                    Game.save();
                }
            }
            
        }
        
        static change_sideways_velocity (x) {
            Player.target_velocity.sideways = x;
        }
    
        static change_verticle_velocity (y) {
            Player.target_velocity.verticle = y;
        }
    
        static change_forward_velocity (z) {
            Player.target_velocity.forward = z;
        }
    
        static change_rotation_velocity (rotation) {
            Player.target_velocity.rotation = rotation;
        }
    
        static remove_item(targeted_item_info) {
            if (!targeted_item_info) {
                return;
            }
            let item = targeted_item_info.object;
            if (item) {
                if (World.delete_item(item)) {
                    Sounds.play('delete_block');
                }
            }
        }

        static place_item(attachment_point_info) {
            if (!attachment_point_info) {
                return;
            }
            if (!attachment_point_info.object) {
                return;
            }
            if (World.place_item(attachment_point_info)) {
                Sounds.play('place_block');
            }
        }
        
    }
    
    class World {

        static coord_index = new Map();
        
        static add_to_coord_index(item) {

            let x = parseInt(Math.round(item.position.x));
            let y = parseInt(Math.round(item.position.y));
            let z = parseInt(Math.round(item.position.z));
    
            let x_map = World.coord_index.get(x);
            if (typeof x_map === "undefined") {
                x_map = new Map();
                World.coord_index.set(x, x_map);
            }
            let y_map = x_map.get(y);
            if (typeof y_map === "undefined") {
                y_map = new Map();
                x_map.set(y, y_map);
            }
            let z_map = y_map.get(z);
            if (typeof z_map === "undefined") {
                z_map = new Map();
                y_map.set(z, z_map);
            }
            
            z_map.set(item.uuid, item);
        }
        
        static remove_from_coord_index(item) {
            let x = parseInt(Math.round(item.position.x));
            let y = parseInt(Math.round(item.position.y));
            let z = parseInt(Math.round(item.position.z));
    
            let x_map = World.coord_index.get(x);
            if (typeof x_map === "undefined") {
                return;
            }
            let y_map = x_map.get(y);
            if (typeof y_map === "undefined") {
                return;
            }
            let z_map = y_map.get(z);
            if (typeof z_map === "undefined") {
                return;
            }
            z_map.delete(item.uuid);
    
            if (!z_map.size) {
                y_map.delete(z);
            }
            if (!y_map.size) {
                x_map.delete(y);
            }
            if (!x_map.size) {
                World.coord_index.delete(x);
            }
        }
    
        static get_items_from_coord_index(x, y, z) {
            x = parseInt(Math.round(x));
            y = parseInt(Math.round(y));
            z = parseInt(Math.round(z));
    
            let x_map = World.coord_index.get(x);
            if (typeof x_map === "undefined") {
                return [];
            }
            let y_map = x_map.get(y);
            if (typeof y_map === "undefined") {
                return [];
            }
            let z_map = y_map.get(z);
            if (typeof z_map === "undefined") {
                return [];
            }
            let values = [];
            for (const value of z_map.values()) {
                values.push(value);
            }
            return values;

        }
    
        static get_nearby_items(x, y, z, distance = 1) {
            x = parseInt(Math.round(x));
            y = parseInt(Math.round(y));
            z = parseInt(Math.round(z));
    
            let start = 0 - distance;
            let end = distance;
            
            let items = [];
            for (let xi = x - distance; xi <= x + distance; xi++) {
                for (let yi = y - distance; yi <= y + distance; yi++) {
                    for (let zi = z - distance; zi <= z + distance; zi++) {
                        let values = World.get_items_from_coord_index(xi, yi, zi);
                        for (let vi = 0; vi < values.length; vi++) {
                            items.push(values[vi]);
                        }
                    }
                }
            }
            return items;
        }
        
        // point Vector3 in world coords
        static point_is_inside_object(point, object) {
        
            if (typeof World.point_is_inside_object.raycaster === "undefined") {
                World.point_is_inside_object.raycaster = new THREE.Raycaster();
                World.point_is_inside_object.direction = new THREE.Vector3();
                World.point_is_inside_object.check_point = new THREE.Vector3();
                World.point_is_inside_object.center_point = new THREE.Vector3();
            }
            let raycaster = World.point_is_inside_object.raycaster;
            let direction = World.point_is_inside_object.direction;
            let check_point = World.point_is_inside_object.check_point;
            let center_point = World.point_is_inside_object.center_point;
            let intersects;
        
            object.updateWorldMatrix();
    
            center_point.set(point.x, point.y, point.z);
            object.worldToLocal(center_point);
    
            let check_points = [];
            check_points.push([center_point.x - 1, center_point.y, center_point.z]); // left
            check_points.push([center_point.x + 1, center_point.y, center_point.z]); // right
            check_points.push([center_point.x, center_point.y + 1, center_point.z]); // top
            check_points.push([center_point.x, center_point.y - 1, center_point.z]); // bottom
            check_points.push([center_point.x, center_point.y, center_point.z + 1]); // front
            check_points.push([center_point.x, center_point.y, center_point.z - 1]); // back
        
            // let arrows = [];
            for (let n = 0; n < check_points.length; n++) {
                check_point.set(check_points[n][0], check_points[n][1], check_points[n][2]);
                object.localToWorld(check_point);
                direction.subVectors(point, check_point);
                direction.normalize();
                raycaster.set(check_point, direction);
                intersects = raycaster.intersectObject(object, false);
                // let arrow = new THREE.ArrowHelper(raycaster.ray.direction, raycaster.ray.origin, 2, 0x0000FF, 0, 0);
                // Game.scene.add(arrow);
                // arrows.push(arrow);
                if (!intersects.length) {
                    // for (let i = 0; i < arrows.length; i++) {
                    //     Game.scene.remove(arrows[i]);
                    // }
                    return false;
                }
            }
            
            return true;
        }
        
        static items_group;
    
        static init() {
    
            World.items_group = new THREE.Group();
            World.items_group.name = "world_items_group";
    
            Game.scene.add(World.items_group);

            World.add_sky();

            // lighting
            const skyColor = 0xe8e8e8;  // light blue
            const groundColor = 0x7c7c7c;  // brownish orange
            const intensity = 1;
            const light = new THREE.HemisphereLight(skyColor, groundColor, intensity);
            Game.scene.add(light);
            
            // fog
            const fog_color = 0xFFFFFF;
            Game.scene.fog = new THREE.Fog(fog_color, 25, 50);
    
        }
    
        static working_item_type_identifier = 201;
        
        static hide() {
            World.items_group.visible = false;
            World.clear_targeted_item();
        }
        
        static show(){
            World.items_group.visible = true;
        }
        
        static move() {
            for (let i = 0; i < World.items_group.children.length; i++) {
                World.items_group.children[i].move();
            }
        }

        static get_item_config(block_type_identifier) {
            block_type_identifier = parseInt(block_type_identifier);
            for (let i = 0; i < Game.config.item_types_config.length; i++) {
                if (Game.config.item_types_config[i]['id'] === block_type_identifier) {
                    return Game.config.item_types_config[i];
                }
            }
        }

        static place_item(attachment_point_info) {
            let item = Item.create_item(World.working_item_type_identifier);
            let attachment_point = attachment_point_info.object.get_attachment_point(item, attachment_point_info);
            if (attachment_point) {
                attachment_point.add(item);
                World.items_group.attach(item);
                if (World.intersects_item(item)) {
                    World.items_group.remove(item);
                    return false;
                }

                item.updateMatrix();
                item.hide_connected_faces();
                World.add_to_coord_index(item);
                Game.save();
                return true;
            }
            return false;
        }
        
        static add_item(px, py, pz, rx, ry, rz, block_type_identifier) {
    
            let item = Item.create_item(block_type_identifier);
            item.position.set(
                parseFloat(px),
                parseFloat(py),
                parseFloat(pz),
            );
            item.rotation.set(
                parseFloat(rx),
                parseFloat(ry),
                parseFloat(rz),
            );
    
            World.items_group.add(item);
            item.updateMatrix();
            item.hide_connected_faces();
            World.add_to_coord_index(item);

            return true;
        }
    
        static delete_item(item) {
    
            if (World.items_group.visible === false) {
                return false;
            }

            World.clear_targeted_item();
            if (World.items_group.children.length === 1) {
                return false;
            }
    
            item.show_connected_faces();
            World.remove_from_coord_index(item);
            World.items_group.remove(item);
            Game.save();
            return true;
        }
        
        static targeted_item = null;
        
        static set_targeted_item(item) {
    
            if (World.items_group.visible === false) {
                return;
            }
            
            if (!item) {
                // clear selection
                if (World.targeted_item) {
                    World.clear_targeted_item();
                }
                return;
            }

            if (World.targeted_item && item.uuid === World.targeted_item.uuid) {
                // already selected
                return;
            }

            if (World.targeted_item) {
                World.clear_targeted_item();
            }

            World.targeted_item = item;
            World.targeted_item.highlight();
            
        }

        static clear_targeted_item() {
            if (World.targeted_item) {
                World.targeted_item.clear_highlight();
                World.targeted_item = null;
            }
        }
    
        static draw_point(x, y, z, color=0xFF0000) {
            const geometry = new THREE.BoxGeometry(0.05, 0.05, 0.05);
            const material = new THREE.MeshBasicMaterial( { color: color } );
            const cube = new THREE.Mesh( geometry, material );
            Game.scene.add( cube );
            cube.position.set(x, y, z);
            return cube;
        }
    
        static intersects_item(item) {
            return !!(World.get_intersecting_item(item));
        }
    
        // get the first world-item found that the given object collides with
        static get_intersecting_item(item) {
        
            if (typeof World.get_intersecting_item.scratch_items_by_geometry === "undefined") {
                World.get_intersecting_item.scratch_items_by_geometry = new Map();
            }
            let scratch_items_by_geometry = World.get_intersecting_item.scratch_items_by_geometry;

            let item_vertices = item.get_vertices();
        
            let nearby_items = World.get_nearby_items(item.position.x, item.position.y, item.position.z);
        
            // test each of the item vertices to see if it's inside any of the nearby world items
            for (let n = 0; n < nearby_items.length; n++) {
                let nearby_item = nearby_items[n];
                for (let i = 0; i < item_vertices.length; i++) {
                    let item_vertex = item_vertices[i];
                    if (World.point_is_inside_object(item_vertex, nearby_item)) {
                        return nearby_item;
                    }
                }
            }
        
            // test each nearby world item vertices, see if any of them are inside the new object space
            // We also shrink it a tiny bit, in case two items are exactly the same spot, so the world vertices wil be found to be
            // inside the object.  In this case they are considered collided
            for (let n = 0; n < nearby_items.length; n++) {
                let nearby_item = nearby_items[n];
            
                // get vertices of the nearby item space
                let scratch_item = scratch_items_by_geometry.get(nearby_item.geometry.uuid);
                if (!scratch_item) {
                    scratch_item = new Item( nearby_item.geometry );
                    scratch_items_by_geometry.set(nearby_item.geometry.uuid, scratch_item);
                }
                scratch_item.scale.set(0.99, 0.99, 0.99);
                scratch_item.position.set(0, 0, 0);
                scratch_item.rotation.set(0, 0, 0);
                nearby_item.add(scratch_item);
                Game.scene.attach(scratch_item);
                let nearby_item_vertices = scratch_item.get_vertices();
                Game.scene.remove(scratch_item);
            
                for (let i = 0; i < nearby_item_vertices.length; i++) {
                    let nearby_item_vertex = nearby_item_vertices[i];
                    if (World.point_is_inside_object(nearby_item_vertex, item)) {
                        return nearby_item;
                    }
                }
            }
        
            return null;
        }
    

        static add_sky() {
    
            // Game.scene.background = new THREE.Color( 0xEEEEEE );
            // return;
            
            function gradTexture(color) {
                let c = document.createElement("canvas");
                let ct = c.getContext("2d");
                let size = 1024;
                c.width = 16;
                c.height = size;
                let gradient = ct.createLinearGradient(0, 0, 0, size);
                let i = color[0].length;
                while (i--) {
                    gradient.addColorStop(color[0][i], color[1][i]);
                }
                ct.fillStyle = gradient;
                ct.fillRect(0, 0, 16, size);
                let texture = new THREE.Texture(c);
                texture.needsUpdate = true;
                return texture;
            }
    
            let buffgeoBack = new THREE.IcosahedronGeometry(Game.config.fov_far - 100, 2);
            let back = new THREE.Mesh(
                buffgeoBack,
                new THREE.MeshBasicMaterial({
                    map: gradTexture(
                        [
                            [0.95, 0.6, 0.4, 0.15],
                            // [0.15, 0.4, 0.6, 0.75],
                            ['#1261A0', '#3895D3', '#00CCFF', '#87CEEB']
                        ]
                    ),
                    side: THREE.BackSide,
                    depthWrite: false,
                    fog: false
                })
            );

            // the sky is centered on the player
            Player.group.add(back);
            
        }

    }
    
    class MaterialFactory {
    
        static materials = {};
        static textures = {};
        
        static hidden_face = new THREE.MeshBasicMaterial({visible: false, name: "hidden face"});

        static get_material (material_iden) {
    
            if (!MaterialFactory.materials[material_iden]) {
                if (!Game.config.materials_config[material_iden]) {
                    Game.log("unknown material iden " + material_iden);
                }
                
                let material_type = Game.config.materials_config[material_iden]['type'];
                let material_params = Game.config.materials_config[material_iden]['params'];

                if (typeof material_params.url !== "undefined") {
                    let image_url = Game.config.assets_dir + "/" + material_params.url;
                    delete(material_params.url);
                    if (!MaterialFactory.textures[material_iden]) {
                        MaterialFactory.textures[material_iden] = new THREE.TextureLoader().load(image_url);
                        MaterialFactory.textures[material_iden].wrapS = THREE.RepeatWrapping; // horizontal
                        MaterialFactory.textures[material_iden].wrapT = THREE.RepeatWrapping; // vertical
                        MaterialFactory.textures[material_iden].magFilter = THREE.NearestFilter;
                        // const repeats_per_unit = 1;
                        // MaterialFactory.textures[material_iden].repeat.set(repeats_per_unit, repeats_per_unit);
                    }
                    material_params.map = MaterialFactory.textures[material_iden];
                }

                if (material_type === "basic") {
                    MaterialFactory.materials[material_iden] = new THREE.MeshBasicMaterial(material_params);
                }
                else if (material_type === "phong") {
                    MaterialFactory.materials[material_iden] = new THREE.MeshLambertMaterial(material_params);
                    // MaterialFactory.materials[material_iden] = new THREE.MeshPhongMaterial(material_params);
                }
            }
            return MaterialFactory.materials[material_iden];
        }
    
        static get_mesh_materials(block_type_identifier) {
            let item_config = World.get_item_config(block_type_identifier);
            let mesh_material_identifiers = item_config['sides'];
            let mesh_materials = [];
            for (let i = 0; i < mesh_material_identifiers.length; i++) {
                mesh_materials.push(MaterialFactory.get_material(mesh_material_identifiers[i]));
            }
            if (mesh_materials.length === 1) {
                // spheres, don't list a bazzilion materials, 1 for each facet, we dont hide them anyway.
                mesh_materials = mesh_materials[0];
            }
            return mesh_materials
        }
        
        
    }
    
    class Item extends THREE.Mesh {
    
        static size = 1;
        static geometries = {};
        
        static create_item(block_type_identifier) {
            block_type_identifier = parseInt(block_type_identifier);
    
            let item_config = World.get_item_config(block_type_identifier);
            let geometry_type_identifier = item_config['geometry_id'];
            geometry_type_identifier = parseInt(geometry_type_identifier);

            let item;
            switch (geometry_type_identifier) {
                case 1:
                    item = new Cube(block_type_identifier);
                    break;
                case 2:
                    item = new Angle45(block_type_identifier);
                    break;
                case 3:
                    item = new Sphere(block_type_identifier);
                    break;
            }
            item.userData.material = [];
            for (let i = 0; i < item.material.length; i++) {
                item.userData.material[i] = item.material[i];
            }
            item.userData.block_type_identifier = block_type_identifier;
            item.matrixAutoUpdate = false
            return item;
        }

        get_vertices() {
            let vertices = [];
            let pos = this.geometry.getAttribute("position");
            for (let i = 0; i < (pos.count * pos.itemSize); i += pos.itemSize) {
                let vertex = new THREE.Vector3(pos.array[i], pos.array[i + 1], pos.array[i + 2]);
                vertex.applyMatrix4(this.matrixWorld); // world position
                vertices.push(vertex);
            }
            return vertices;
        }
    
        hide_connected_faces() {
            let connected_face_info = this.get_connected_faces();
            for (let i = 0; i < connected_face_info.length; i++) {
                let face_index = connected_face_info[i][0];
                let nearby_item = connected_face_info[i][1];
                let nearby_item_face_index = connected_face_info[i][2];
                this.material[face_index] = MaterialFactory.hidden_face;
                nearby_item.material[nearby_item_face_index] = MaterialFactory.hidden_face;
            }
        }
    
        show_connected_faces() {
            let connected_face_info = this.get_connected_faces();
            for (let i = 0; i < connected_face_info.length; i++) {
                let face_index = connected_face_info[i][0];
                let nearby_item = connected_face_info[i][1];
                let nearby_item_face_index = connected_face_info[i][2];
                this.material[face_index] = this.userData.material[face_index];
                nearby_item.material[nearby_item_face_index] = nearby_item.userData.material[nearby_item_face_index];
            }
        }
    
        get_connected_faces() {
    
            let max_diff = Game.config.space_between_items + 0.001;
            
            let faces = this.get_faces();
            let nearby_items = World.get_nearby_items(this.position.x, this.position.y, this.position.z);
            let matching_faces = [];
    
            for (let i = 0; i < nearby_items.length; i++) {
                let nearby_item = nearby_items[i];
                if (nearby_item.uuid === this.uuid) {
                    continue;
                }
                
                let nearby_faces = nearby_item.get_faces();
            
                let found_shared_face = false;
            
                for (let nearby_face_index = 0; nearby_face_index < nearby_faces.length; nearby_face_index++) {
                    let nearby_face = nearby_faces[nearby_face_index];
                    for (let face_index = 0; face_index < faces.length; face_index++) {
                        let face = faces[face_index];
                    
                        let matching_face = true;
                    
                        // look for a vertex that does not appear in the nearby face vertices,
                        // this means the faces do not match
                        for (let face_vertex_index = 0; face_vertex_index < face.length; face_vertex_index++) {
                            let face_vertex = face[face_vertex_index];
                            let face_vertex_found_in_nearby_face_vertices = false;
                        
                            for (let nearby_face_vertex_index = 0; nearby_face_vertex_index < face.length; nearby_face_vertex_index++) {
                                let nearby_face_vertex = nearby_face[nearby_face_vertex_index];
                                if (
                                    Math.abs(face_vertex.x - nearby_face_vertex.x) <= max_diff
                                    && Math.abs(face_vertex.y - nearby_face_vertex.y) <= max_diff
                                    && Math.abs(face_vertex.z - nearby_face_vertex.z) <= max_diff
                                ) {
                                    face_vertex_found_in_nearby_face_vertices = true;
                                    break;
                                }
                            }
                            if (!face_vertex_found_in_nearby_face_vertices) {
                                // this face does not match
                                matching_face = false;
                                break;
                            }
                        }
                    
                        if (matching_face) {
                            matching_faces.push([face_index, nearby_item, nearby_face_index]);
                            // break out of comparing with this nearby object, because this face can only match a face on the nearby obj once
                            found_shared_face = true;
                            break;
                        }
                    }
                
                    if (found_shared_face) {
                        break;
                    }
                }
            }
        
            return matching_faces;
        
        }
    
        move() {}
    
        highlight() {}
    
        clear_highlight() {}
    
        get_attachment_point(item, attachment_point_info) {
            return null;
        }
    
        get_faces() {
            return [];
        }
    
    }
    
    class Cube extends Item {
    
        constructor(block_type_identifier) {
            super(Cube.get_geometry(), MaterialFactory.get_mesh_materials(block_type_identifier));
        }
    
        static get_geometry() {
            let geometry_type_identifier = 1;
            if (typeof Item.geometries[geometry_type_identifier] === "undefined") {
                Item.geometries[geometry_type_identifier] = Cube.build_geometry();
            }
            return Item.geometries[geometry_type_identifier];
        }
        
        static build_geometry() {
            let size = Item.size - Game.config.space_between_items;
            return new THREE.BoxBufferGeometry(size, size, size);
        }
        
        get_attachment_point(item, attachment_point_info) {
    
            let item_config = World.get_item_config(item.userData.block_type_identifier);
            let item_geometry_id = item_config.geometry_id;
            let do_verticle_rotation = false;
            if (item_geometry_id === 2) {
                do_verticle_rotation = true;
            }
            
            let attachment_point = new THREE.Object3D();
            attachment_point.name = "attachment_point";
            
            this.add(attachment_point);
    
            let new_item_rotation = Math.atan2(attachment_point_info.uv.y - 0.5, attachment_point_info.uv.x - 0.5);
            new_item_rotation = new_item_rotation / (Math.PI * 2);
            new_item_rotation += 0.375
            new_item_rotation = Math.floor(new_item_rotation * 4);
            new_item_rotation *= (Math.PI / 2);
            
            // right
            if (attachment_point_info.faceIndex === 0 || attachment_point_info.faceIndex === 1) {
                attachment_point.position.x++;
                if (do_verticle_rotation) {
                    attachment_point.rotateZ(0 - (Math.PI / 2));
                    attachment_point.rotateY(new_item_rotation + (Math.PI / 2));
                }
            }

            // left
            else if (attachment_point_info.faceIndex === 2 || attachment_point_info.faceIndex === 3) {
                attachment_point.position.x--;
                if (do_verticle_rotation) {
                    attachment_point.rotateZ(Math.PI / 2);
                    attachment_point.rotateY(new_item_rotation - (Math.PI / 2));
                }
            }
            
            // top
            else if (attachment_point_info.faceIndex === 4 || attachment_point_info.faceIndex === 5) {
                attachment_point.position.y++;
                attachment_point.rotateY(new_item_rotation);
            }
            
            // bottom
            else if (attachment_point_info.faceIndex === 6 || attachment_point_info.faceIndex === 7) {
                attachment_point.position.y--;
                if (do_verticle_rotation) {
                    attachment_point.rotateY(Math.PI);
                    attachment_point.rotateX(Math.PI);
                }
                attachment_point.rotateY(new_item_rotation + Math.PI);
            }
            
            // front
            else if (attachment_point_info.faceIndex === 8 || attachment_point_info.faceIndex === 9) {
                attachment_point.position.z++;
                if (do_verticle_rotation) {
                    attachment_point.rotateX(Math.PI / 2);
                    attachment_point.rotateY(new_item_rotation);
                }
            }
            
            // back
            else if (attachment_point_info.faceIndex === 10 || attachment_point_info.faceIndex === 11) {
                attachment_point.position.z--;
                if (do_verticle_rotation) {
                    attachment_point.rotateX(0 - (Math.PI / 2));
                    attachment_point.rotateY(new_item_rotation + Math.PI);
                }
            }
    
            Game.scene.attach(attachment_point);
            Game.scene.remove(attachment_point);
            return attachment_point;
            
        }
    
        static highlight_lines = null;
        
        highlight() {
            if (Cube.highlight_lines === null) {
                let blockEdgeGeometry = new THREE.BoxBufferGeometry(Item.size, Item.size, Item.size);
                let edgeGeometry = new THREE.EdgesGeometry(blockEdgeGeometry);
                let edgeMaterial = new THREE.LineBasicMaterial({color: 0xA6A6A6});
                Cube.highlight_lines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
            }
            this.add(Cube.highlight_lines);
        }

        clear_highlight() {
            this.remove(Cube.highlight_lines);
        }
    
        get_faces() {
            let vertices = [];
            let pos = this.geometry.getAttribute("position");
            this.updateMatrixWorld();
            for (let i = 0; i < (pos.count * pos.itemSize); i += pos.itemSize) {
                let vertex = new THREE.Vector3(pos.array[i], pos.array[i + 1], pos.array[i + 2]);
                vertex.applyMatrix4(this.matrixWorld); // world position
                vertices.push(vertex);
            }
    
            // vertices[0], // right top front
            // vertices[1], // right top back
            // vertices[2], // right bottom front
            // vertices[3], // right bottom back
            // vertices[4], // left top back
            // vertices[5], // left top front
            // vertices[6], // left bottom back
            // vertices[7], // left bottom front
    
            return [
                [vertices[2], vertices[3], vertices[1], vertices[0]], // face 1, right
                [vertices[6], vertices[7], vertices[5], vertices[4]], // face 2, left
                [vertices[5], vertices[0], vertices[1], vertices[4]], // face 3, top
                [vertices[6], vertices[3], vertices[2], vertices[7]], // face 4, bottom
                [vertices[7], vertices[2], vertices[0], vertices[5]], // face 5, front
                [vertices[3], vertices[6], vertices[4], vertices[1]], // face 6, back
            ];
        }
    
    }
    
    
    class Sphere extends Item {
    
        constructor(block_type_identifier) {
            super(Sphere.get_geometry(), MaterialFactory.get_mesh_materials(block_type_identifier));
        }
    
        static get_geometry() {
            let geometry_type_identifier = 3;
            if (typeof Item.geometries[geometry_type_identifier] === "undefined") {
                Item.geometries[geometry_type_identifier] = Sphere.build_geometry();
            }
            return Item.geometries[geometry_type_identifier];
        }
    
        static build_geometry() {
            let size = Item.size - Game.config.space_between_items;
            let radius = (1 - Game.config.space_between_items) / 2;
            return new THREE.SphereBufferGeometry(radius);
        }
        
        speed = 0;
        
        move() {
            if (!this.speed) {
                this.speed = (Utils.get_random_number(1, 10) / 1000)
            }
    
            this.position.y += this.speed;
            this.updateMatrix();
            if (Utils.get_random_number(1, 1000) === 1) {
                World.delete_item(this);
            }
        }
    
        static highlight_lines = null;
        
    }
    
    class Angle45 extends Item {
    
        constructor(block_type_identifier) {
            super(Angle45.get_geometry(), MaterialFactory.get_mesh_materials(block_type_identifier));
        }
    
        static get_geometry() {
            let geometry_type_identifier = 2;
            if (typeof Item.geometries[geometry_type_identifier] === "undefined") {
                Item.geometries[geometry_type_identifier] = Angle45.build_geometry();
            }
            return Item.geometries[geometry_type_identifier];
        }
        
        static build_geometry() {
    
            let size = Item.size - Game.config.space_between_items;
    
            let geometry = new THREE.BufferGeometry();
            let halfwidth = size / 2;
    
            let shrinkage = (1 - size) / 2;
            
            
            // shrinkage / Math.sin(Math.PI / 4);
            
            const height = (Math.cos((Math.PI / 180) * 45) * size);
            const long_x = (Math.sin((Math.PI / 180) * 45)) * size;
            const short_x = size - long_x;
            const top_z =  0 - long_x + halfwidth;
            const top_y = height - halfwidth;
    
            const left_front = {
                x: 0 - halfwidth,
                y: 0 - halfwidth,
                z: halfwidth - (shrinkage / Math.sin(Math.PI / 4))
            };
            const left_back = {
                x: 0 - halfwidth,
                y: 0 - halfwidth,
                z: 0 - halfwidth
            };
            const left_top = {
                x: 0 - halfwidth,
                y: top_y - (shrinkage / Math.cos(Math.PI / 4)),
                z: top_z
            };
            const right_front = {
                x: halfwidth,
                y: 0 - halfwidth,
                z: halfwidth - (shrinkage / Math.sin(Math.PI / 4))
            };
            const right_back = {
                x: halfwidth,
                y: 0 - halfwidth,
                z: 0 - halfwidth
            };
            const right_top = {
                x: halfwidth,
                y: top_y - (shrinkage / Math.cos(Math.PI / 4)),
                z: top_z
            };
    
            const vertices = [
                // left face
                { pos: [left_front.x, left_front.y, left_front.z], norm: [-1,0,0], uv: [size,0], },
                { pos: [left_top.x, left_top.y, left_top.z], norm: [-1,0,0], uv: [short_x, height], },
                { pos: [left_back.x, left_back.y, left_back.z], norm: [-1,0,0], uv: [0,0], },
        
                // right face
                { pos: [right_front.x, right_front.y, right_front.z], norm: [1,0,0], uv: [0,0], },
                { pos: [right_back.x, right_back.y, right_back.z], norm: [1,0,0], uv: [size, 0], },
                { pos: [right_top.x, right_top.y, right_top.z], norm: [1,0,0], uv: [long_x, height], },
        
                // front triangle 1/6/3
                { pos: [left_front.x, left_front.y, left_front.z], norm: [0,height,short_x], uv: [0,0], },
                { pos: [right_top.x, right_top.y, right_top.z], norm: [0,height,short_x], uv: [size, height], },
                { pos: [left_top.x, left_top.y, left_top.z], norm: [0,height,short_x], uv: [0, height], },
        
                // front triangle 1/4/6
                { pos: [left_front.x, left_front.y, left_front.z], norm: [0,height,short_x], uv: [0,0], },
                { pos: [right_front.x, right_front.y, right_front.z], norm: [0,height,short_x], uv: [size, 0], },
                { pos: [right_top.x, right_top.y, right_top.z], norm: [0,height,short_x], uv: [size, height], },
        
                // back triangle 5/3/6
                { pos: [right_back.x, right_back.y, right_back.z], norm: [0,height,0 - long_x], uv: [0,0], },
                { pos: [left_top.x, left_top.y, left_top.z], norm: [0,height,0 - long_x], uv: [size, height], },
                { pos: [right_top.x, right_top.y, right_top.z], norm: [0,height,0 - long_x], uv: [0, height], },
        
                // back triangle 5/2/3
                { pos: [right_back.x, right_back.y, right_back.z], norm: [0,height,0 - long_x], uv: [0,0], },
                { pos: [left_back.x, left_back.y, left_back.z], norm: [0,height,0 - long_x], uv: [size, 0], },
                { pos: [left_top.x, left_top.y, left_top.z], norm: [0,height,0 - long_x], uv: [size, height], },
        
                // bottom triangle 1/5/4
                { pos: [left_front.x, left_front.y, left_front.z], norm: [0,-1,0], uv: [0, size], },
                { pos: [right_back.x, right_back.y, right_back.z], norm: [0,-1,0], uv: [size, 0], },
                { pos: [right_front.x, right_front.y, right_front.z], norm: [0,-1,0], uv: [size, size], },
        
                // bottom triangle 1/2/5
                { pos: [left_front.x, left_front.y, left_front.z], norm: [0,-1,0], uv: [0, size], },
                { pos: [left_back.x, left_back.y, left_back.z], norm: [0,-1,0], uv: [0,0], },
                { pos: [right_back.x, right_back.y, right_back.z], norm: [0,-1,0], uv: [size,0], },
    
            ];
    
            const positions = [];
            const normals = [];
            const uvs = [];
            for (const vertex of vertices) {
                positions.push(...vertex.pos);
                normals.push(...vertex.norm);
                uvs.push(...vertex.uv);
            }
    
            const positionNumComponents = 3;
            const normalNumComponents = 3;
            const uvNumComponents = 2;
            geometry.setAttribute(
                'position',
                new THREE.BufferAttribute(new Float32Array(positions), positionNumComponents));
            geometry.setAttribute(
                'normal',
                new THREE.BufferAttribute(new Float32Array(normals), normalNumComponents));
            geometry.setAttribute(
                'uv',
                new THREE.BufferAttribute(new Float32Array(uvs), uvNumComponents));
    
    
            geometry.setIndex([
                0,1,2,3,4,5,
                6,7,8,9,10,11,
                12,13,14,15,16,17,
                18,19,20,21,22,23,
            ]);
    
            // start, count, materialIndex
            geometry.addGroup(6, 6, 0); // top
            geometry.addGroup(18, 6, 1); // bottom
            geometry.addGroup(12, 6, 2); // back
            geometry.addGroup(0, 3, 3); // left
            geometry.addGroup(3, 3, 4); // right

            return geometry;
        }
    
        get_faces() {
            let vertices = [];
            let pos = this.geometry.getAttribute("position");
            this.updateMatrixWorld();
            for (let i = 0; i < (pos.count * pos.itemSize); i += pos.itemSize) {
                let vertex = new THREE.Vector3(pos.array[i], pos.array[i + 1], pos.array[i + 2]);
                vertex.applyMatrix4(this.matrixWorld); // world position
                vertices.push(vertex);
            }
        
            // vertices[0], // left front
            // vertices[1], // left top
            // vertices[2], // left back
            // vertices[3], // right front
            // vertices[4], // right back
            // vertices[5], // right top
        
            return [
                [vertices[0], vertices[3], vertices[5], vertices[1]], // top face
                [vertices[0], vertices[3], vertices[4], vertices[2]], // bottom face
            ];
        }
        
        get_attachment_point(item, attachment_point_info) {
    
            // cannot attach to these faces
            if (
                attachment_point_info.faceIndex === 0 // left
                || attachment_point_info.faceIndex === 1 // right
                || attachment_point_info.faceIndex === 4 // back
                || attachment_point_info.faceIndex === 5 // back
            ) {
                return null;
            }
    
            let attachment_point = new THREE.Object3D();
            attachment_point.name = "attachment_point";
            this.add(attachment_point);
            
            let new_item_rotation = Math.atan2(attachment_point_info.uv.y - 0.5, attachment_point_info.uv.x - 0.5);
            new_item_rotation = new_item_rotation / (Math.PI * 2);
            new_item_rotation += 0.375
            new_item_rotation = Math.floor(new_item_rotation * 4);
            new_item_rotation *= (Math.PI / 2);
        
            // front
            if (attachment_point_info.faceIndex === 2 || attachment_point_info.faceIndex === 3) {
                // let offset = (1 - Game.config.space_between_items) / 2;
                let offset = 1 / 2;
    
                // attachment_point.rotateX(Math.PI / 2);
                // attachment_point.rotateY(Math.PI);
                // attachment_point.rotateX(Math.PI);
    
    
                attachment_point.position.y -= offset;
                attachment_point.position.z += offset;
                attachment_point.rotateX(Math.PI / 4); // 45 deg counter
                let attachment_point_offset = new THREE.Object3D();
                attachment_point_offset.position.set(0, offset, 0 - offset);
                attachment_point.add(attachment_point_offset);
                Game.scene.attach(attachment_point_offset);
                attachment_point  = attachment_point_offset;
                attachment_point.rotateY(new_item_rotation);
            }

            // bottom
            else if (attachment_point_info.faceIndex === 6 || attachment_point_info.faceIndex === 7) {
                attachment_point.position.y--;
                attachment_point.rotateZ(Math.PI);
                attachment_point.rotateY(Math.PI + new_item_rotation);
            }
            
            Game.scene.attach(attachment_point);
            Game.scene.remove(attachment_point);
            return attachment_point;
        
        }
        
        static highlight_lines = null;
    
        highlight() {
            if (Angle45.highlight_lines === null) {
                let geometry = Angle45.build_geometry(Item.size);
                let edgeGeometry = new THREE.EdgesGeometry(geometry);
                let edgeMaterial = new THREE.LineBasicMaterial({color: 0xA6A6A6});
                Angle45.highlight_lines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
            }
            this.add(Angle45.highlight_lines);
        }
    
        clear_highlight() {
            this.remove(Angle45.highlight_lines);
        }
    }
    
    
    class SelectBlockControlPanel {

        static panel_group = null;
    
        static visible = false;
        
        static toggle() {
            if (SelectBlockControlPanel.visible) {
                SelectBlockControlPanel.hide();
            }
            else {
                SelectBlockControlPanel.show();
            }
        }
        
        static show() {
            
            SelectBlockControlPanel.visible = true;
            World.hide();
            
            if (SelectBlockControlPanel.panel_group === null) {
                SelectBlockControlPanel.build_panel();
            }
    
            // Player.group.add(cube);
            // cube.position.set(0, 0, -5);
            // cube.lookAt(Player.group.position);
            // Game.scene.attach( cube );
    
            Player.group.add(SelectBlockControlPanel.panel_group);
            SelectBlockControlPanel.panel_group.position.set(0, 0, 0);
            SelectBlockControlPanel.panel_group.rotation.set(0, 0, 0);
            let a = Headset.get_world_horizontal_rotation_angle();
            let pa = Utils.get_horizontal_rotation_angle(Player.group);
            let diff = a - pa;
            SelectBlockControlPanel.panel_group.rotateY(diff);
            Game.scene.attach(SelectBlockControlPanel.panel_group);
            SelectBlockControlPanel.panel_group.visible = true;
    
        }
        
        static hide() {
            SelectBlockControlPanel.visible = false;
            SelectBlockControlPanel.panel_group.visible = false;
            SelectBlockControlPanel.clear_targeted_item();
            World.show();
            SelectBlockControlPanel.panel_group.visible = false;
        }
    
        static targeted_item = null;
        
        static set_targeted_item(item) {
            if (!item) {
                if (SelectBlockControlPanel.targeted_item) {
                    SelectBlockControlPanel.clear_targeted_item();
                }
                return;
            }
    
            if (SelectBlockControlPanel.targeted_item && item.uuid === SelectBlockControlPanel.targeted_item.uuid) {
                // already selected
                return;
            }
            
            SelectBlockControlPanel.targeted_item = item;
        }
        
        static clear_targeted_item() {
            if (SelectBlockControlPanel.targeted_item) {
                SelectBlockControlPanel.targeted_item.rotation.set(0,0,0);
                SelectBlockControlPanel.targeted_item.updateMatrix();
                SelectBlockControlPanel.targeted_item = null;
            }
        }

        static select_item() {
            if (SelectBlockControlPanel.targeted_item) {
                Sounds.play("click");
                World.working_item_type_identifier = SelectBlockControlPanel.targeted_item.userData.block_type_identifier;
                SelectBlockControlPanel.hide();
            }
        }
        
        static animate() {
            if (!SelectBlockControlPanel.visible) {
                return;
            }
            if (!SelectBlockControlPanel.targeted_item) {
                return;
            }
            SelectBlockControlPanel.targeted_item.rotateY(0.02)
            SelectBlockControlPanel.targeted_item.updateMatrix();
        }
        
        static config = {
            width: 5,
            height: 3.75,
            elevation: 0,
            curve_factor: 0.15, // this is a percent of the width, 0 thru 1
            distance: 4, // distance out in front of the player
            color: "#FFFFFF",
        };
        
        static build_panel() {
    
            // let plane_geometry = new THREE.PlaneGeometry(
            //     SelectBlockControlPanel.config.width,
            //     SelectBlockControlPanel.config.height,
            //     10,
            //     10
            // );
            //
            // let bend_offset = SelectBlockControlPanel.config.curve_factor * SelectBlockControlPanel.config.width;
            //
            // let p = plane_geometry.parameters;
            // let hw = p.width * 0.5;
            //
            // let a = new THREE.Vector2(-hw, 0);
            // let b = new THREE.Vector2(0, bend_offset);
            // let c = new THREE.Vector2(hw, 0);
            //
            // let ab = new THREE.Vector2().subVectors(a, b);
            // let bc = new THREE.Vector2().subVectors(b, c);
            // let ac = new THREE.Vector2().subVectors(a, c);
            //
            // let r = (ab.length() * bc.length() * ac.length()) / (2 * Math.abs(ab.cross(ac)));
            //
            // let center = new THREE.Vector2(0, bend_offset - r);
            //
            // let baseV = new THREE.Vector2().subVectors(a, center);
            // let baseAngle = baseV.angle() - (Math.PI * 0.5);
            // let arc = baseAngle * 2;
            //
            // let uv = plane_geometry.attributes.uv;
            // let pos = plane_geometry.attributes.position;
            //
            // let mainV = new THREE.Vector2();
            // for (let i = 0; i < uv.count; i++) {
            //     let uvRatio = 1 - uv.getX(i);
            //     let y = pos.getY(i);
            //     mainV.copy(c).rotateAround(center, (arc * uvRatio));
            //     pos.setXYZ(i, mainV.x, y, -mainV.y);
            // }
            //
            // pos.needsUpdate = true;
            //
            // let plane_material = new THREE.MeshBasicMaterial({
            //     color: SelectBlockControlPanel.config.color,
            //     side: THREE.DoubleSide
            // });
            // let panel = new THREE.Mesh( plane_geometry, plane_material );
            // panel.name = "panel";
    
            SelectBlockControlPanel.panel_group = new THREE.Group();
            SelectBlockControlPanel.panel_group.name = "panel_group";
            // SelectBlockControlPanel.panel_group.add(panel);
    
            let config = SelectBlockControlPanel.config;
    
            let num_cols = 1;
            let ratio = config.width / config.height;
            let num_rows;
            let n = 1;
            while (true) {
                if (n++ > 500) {
                    throw("endless loop sanity check");
                }
                num_rows = Math.ceil(num_cols / ratio);
                if (num_cols * num_rows > Game.config.item_types_config.length) {
                    break;
                }
                num_cols++;
            }

            let box_size = (config.width / (num_cols - 1)) * 0.5;
            let row = 0;
            let col = 0;
            let item_spacing = box_size * 2;
            for (let b = 0; b < Game.config.item_types_config.length; b++){
                const item_config = Game.config.item_types_config[b];
                const block_type_identifier = item_config['id'];
                let item = Item.create_item(block_type_identifier);
                item.scale.set(box_size, box_size, box_size);
                item.position.set(
                    0 - (config.width / 2) + (item_spacing * col),
                    (config.height / 2) - (item_spacing * row),
                    0 - config.distance,
                );
                item.userData.block_type_identifier = block_type_identifier;
                SelectBlockControlPanel.panel_group.add(item);
                item.updateMatrix();
                col++;
                if (col === num_cols) {
                    col = 0;
                    row++
                }
            }

            SelectBlockControlPanel.panel_group.visible = false;
            // Game.scene.add(SelectBlockControlPanel.panel_group);
    
        }
        
    }
    
    class Controls {
    
        static xr_right_controller = null;
        static xr_right_grip = null;
        static xr_left_controller = null;
        static xr_left_grip = null;
    
        static xr_controller_button_mapping = {
            squeeze: 1,
            trigger: 0,
            a: 4,
            b: 5,
        }
    
        static raycaster_distance = 15;
    
        static init() {
        
            if (!Game.config.on_vr_headset) {
                Controls.xr_controller_button_mapping = {
                    squeeze: 0,
                    trigger: 3,
                };
            }
    
            $(document).bind("contextmenu", function(e) {
                return false;
            });
            
            Controls.init_xr_controllers();
    
            Game.renderer.domElement.addEventListener('mousemove', Controls.fire_mouse_move_event);
            Game.renderer.domElement.addEventListener('mousedown', Controls.fire_mouse_click_event);
        
        }
    
        static event_listeners = {};
        
        static add_event_listener(event_name, callback) {
            if (typeof Controls.event_listeners[event_name] === "undefined") {
                Controls.event_listeners[event_name] = [];
            }
            Controls.event_listeners[event_name].push(callback);
        }

        static fire_event(event_name, event) {
            if (typeof Controls.event_listeners[event_name] !== "undefined") {
                for (let i = 0; i < Controls.event_listeners[event_name].length; i++) {
                    Controls.event_listeners[event_name][i](event);
                }
            }
        }
        
        static init_xr_controllers() {
            Controls.init_xr_right_controller();
            Controls.init_xr_right_controller_grip();
            Controls.init_xr_left_controller();
            Controls.init_xr_left_controller_grip();
        }
    
        static init_xr_right_controller() {
            Controls.xr_right_controller = Controls.get_xr_controller("right");
            if (!Controls.xr_right_controller) {
                setTimeout(Controls.init_xr_right_controller, 100);
                return;
            }
        
            Player.group.add(Controls.xr_right_controller);
            let raycaster = new THREE.Raycaster();
            let arrow = new THREE.ArrowHelper(raycaster.ray.direction, raycaster.ray.origin, Controls.raycaster_distance, 0xff0000, 0, 0);
            arrow.visible = true;
            Controls.xr_right_controller.add(arrow);
            Controls.xr_right_controller.userData = {};
            Controls.xr_right_controller.userData.raycaster = raycaster;
            Controls.xr_right_controller.userData.arrow = arrow;
            Controls.xr_right_controller.userData.handedness = "right";
        }
    
        static init_xr_right_controller_grip() {
            Controls.xr_right_grip = Controls.get_xr_controller_grip("right");
            if (!Controls.xr_right_grip) {
                setTimeout(Controls.init_xr_right_controller_grip, 100);
                return;
            }
            let controllerModelFactory = new XRControllerModelFactory();
            Controls.xr_right_grip.add(
                controllerModelFactory.createControllerModel(Controls.xr_right_grip)
            );
            Player.group.add(Controls.xr_right_grip);
        }
    
        static init_xr_left_controller() {
            Controls.xr_left_controller = Controls.get_xr_controller("left");
            if (!Controls.xr_left_controller) {
                setTimeout(Controls.init_xr_left_controller, 100);
                return;
            }
            Player.group.add(Controls.xr_left_controller);
            let raycaster = new THREE.Raycaster();
            let arrow = new THREE.ArrowHelper(raycaster.ray.direction, raycaster.ray.origin, Controls.raycaster_distance, 0xff0000, 0, 0);
            arrow.visible = false;
            Controls.xr_left_controller.add(arrow);
            Controls.xr_left_controller.userData = {};
            Controls.xr_left_controller.userData.raycaster = raycaster;
            Controls.xr_left_controller.userData.arrow = arrow;
            Controls.xr_left_controller.userData.handedness = "left";
        }
    
        static init_xr_left_controller_grip() {
            Controls.xr_left_grip = Controls.get_xr_controller_grip("left");
            if (!Controls.xr_left_grip) {
                setTimeout(Controls.init_xr_left_controller_grip, 100);
                return;
            }
            let controllerModelFactory = new XRControllerModelFactory();
            Controls.xr_left_grip.add(
                controllerModelFactory.createControllerModel(Controls.xr_left_grip)
            );
            Player.group.add(Controls.xr_left_grip);
        }
    
        static get_xr_controller(handedness) {
            return Controls.get_xr_controller_resource(handedness);
        }
    
        static get_xr_controller_grip(handedness) {
            return Controls.get_xr_controller_resource(handedness, "grip");
        }
    
        static get_xr_controller_resource(handedness, resource) {
            if (resource !== "controller" && resource !== "grip") {
                resource = "controller";
            }
    
            let inputSources = Controls.get_xr_input_sources();
            if (!inputSources) {
                return null;
            }
        
            let controller_num = 0;
            for (const source of inputSources) {
                if (!source) {
                    continue;
                }
                if (!source.gamepad) {
                    continue;
                }
                if (
                    !source.handedness
                    || (
                        source.handedness !== "right"
                        && source.handedness !== "left"
                    )
                ) {
                    continue;
                }
            
                if (source.handedness === handedness) {
                    if (resource === "controller") {
                        return Game.renderer.xr.getController(controller_num);
                    } else if (resource === "grip") {
                        return Game.renderer.xr.getControllerGrip(controller_num);
                    }
                }
                controller_num++;
            }
            return null;
        }
    
        static get_info_of_object_targeted_by_xr_controller(controller, group) {
            if (!controller) {
                return null;
            }
    
            if (!group) {
                group = Game.scene;
            }
    
            if (
                typeof controller.userData.arrow === "undefined"
                || controller.userData.arrow === null
            ) {
                return null;
            }
    
            if (controller.userData.arrow.visible === false) {
                return null;
            }
            
            // used to determine what the controller is pointing at
            if (typeof Controls.get_info_of_object_targeted_by_xr_controller.controller_rotation_matrix === "undefined") {
                Controls.get_info_of_object_targeted_by_xr_controller.controller_rotation_matrix = new THREE.Matrix4();
            }
            let controller_rotation_matrix = Controls.get_info_of_object_targeted_by_xr_controller.controller_rotation_matrix;
        
            let raycaster = controller.userData.raycaster;
            controller_rotation_matrix.identity().extractRotation(controller.matrixWorld);
            raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
            raycaster.ray.direction.set(0, 0, -1).applyMatrix4(controller_rotation_matrix);
            let intersects = raycaster.intersectObjects(group.children, false);
            if (intersects.length > 0) {
                if (raycaster.ray.origin.distanceTo(intersects[0].point) > Controls.raycaster_distance) {
                    return null;
                }
                return intersects[0];
            }
            return null;
        }
    
        static get_object_targeted_by_xr_controller(controller, group) {
            if (!group) {
                group = Game.scene;
            }
    
            let object_info = Controls.get_info_of_object_targeted_by_xr_controller(controller);
            if (!object_info || !object_info.object) {
                return null;
            }
            return object_info.object;
        }
    
        static get_info_of_object_targeted_by_mouse(x, y, group) {
            if (!group) {
                group = Game.scene;
            }
        
            if (typeof Controls.get_info_of_object_targeted_by_mouse.mouse_pointer === "undefined") {
                Controls.get_info_of_object_targeted_by_mouse.mouse_pointer = new THREE.Vector3();
                Controls.get_info_of_object_targeted_by_mouse.raycaster = new THREE.Raycaster();
            }
        
            Controls.get_info_of_object_targeted_by_mouse.mouse_pointer.set(
                (x / window.innerWidth) * 2 - 1,
                -(y / window.innerHeight) * 2 + 1,
                0.5
            );
            Controls.get_info_of_object_targeted_by_mouse.raycaster.setFromCamera(
                Controls.get_info_of_object_targeted_by_mouse.mouse_pointer,
                Player.camera
            );
            let intersects = Controls.get_info_of_object_targeted_by_mouse.raycaster.intersectObjects(group.children, false);
            if (intersects.length > 0) {
                return intersects[0];
            }
            return null;
        }
    
        static get_object_targeted_by_mouse(x, y, group) {
            if (!group) {
                group = Game.scene;
            }
            let object_info = Controls.get_info_of_object_targeted_by_mouse(x, y);
            if (!object_info || !object_info.object) {
                return null;
            }
            return object_info.object;
        }
    
        static get_xr_input_sources() {
            const session = Game.renderer.xr.getSession();
            if (session) {
                if (session.inputSources !== null && typeof session.inputSources[Symbol.iterator] === "function") {
                    return session.inputSources;
                }
            }
            return null;
        }
    
        static poll() {
            Controls.fire_xr_controller_events();
        }
    
        // https://stackoverflow.com/questions/62476426/webxr-controllers-for-button-pressing-in-three-js
        static fire_xr_controller_events() {
        
            // use only mouse controls if we are not in xr session, as mouse controls and xr controller controls would conflict
            if (!Game.renderer.xr.isPresenting) {
                return;
            }

            if (typeof Controls.fire_xr_controller_events.prev_controller_states === "undefined") {
                // store the values from the last polling of the controllers, so we know when there's a change
                Controls.fire_xr_controller_events.prev_controller_states = new Map();
            }
        
            let inputSources = Controls.get_xr_input_sources();
            if (!inputSources) {
                return;
            }
        
            let controller_num = 0;
            for (const source of inputSources) {
                if (!source) {
                    continue;
                }
                if (!source.gamepad) {
                    continue;
                }
                if (
                    !source.handedness
                    || (
                        source.handedness !== "right"
                        && source.handedness !== "left"
                    )
                ) {
                    continue;
                }
    
                let controller = Game.renderer.xr.getController(controller_num);
                let handedness = source.handedness;
                let controller_buttons = source.gamepad.buttons.map((b) => b.value);
                let controller_sticks = source.gamepad.axes.slice(0);
                let prev_controller_state = Controls.fire_xr_controller_events.prev_controller_states.get(source);
                if (prev_controller_state) {
                
                    // handlers for buttons
                    controller_buttons.forEach((value, button_num) => {
                        let current_value = Math.round(value);
                        let previous_value = Math.round(prev_controller_state.buttons[button_num]);
                    
                        if (current_value !== previous_value) {
                        
                            // button down
                            if (current_value) {
                                // trigger button
                                if (button_num === Controls.xr_controller_button_mapping.trigger) {
                                    if (handedness === "right") {
                                        Controls.fire_event("onRightTriggerPressed", {controller: controller});
                                    } else if (handedness === "left") {
                                        Controls.fire_event("onLeftTriggerPressed", {controller: controller});
                                    }
                                }
                                // squeeze button
                                else if (button_num === Controls.xr_controller_button_mapping.squeeze) {
                                    if (handedness === "right") {
                                        Controls.fire_event("onRightSqueezePressed", {controller: controller});
                                    } else if (handedness === "left") {
                                        Controls.fire_event("onLeftSqueezePressed", {controller: controller});
                                    }
                                }
                                // a button
                                else if (button_num === Controls.xr_controller_button_mapping.a) {
                                    if (handedness === "right") {
                                        Controls.fire_event("onRightButtonAPressed", {controller: controller});
                                    } else if (handedness === "left") {
                                        Controls.fire_event("onLeftButtonAPressed", {controller: controller});
                                    }
                                }
                                // b button
                                else if (button_num === Controls.xr_controller_button_mapping.b) {
                                    if (handedness === "right") {
                                        Controls.fire_event("onRightButtonBPressed", {controller: controller});
                                    } else if (handedness === "left") {
                                        Controls.fire_event("onLeftButtonBPressed", {controller: controller});
                                    }
                                } else {
                                    Game.log("Unknown " + handedness + " button " + button_num + " pressed");
                                    Sounds.play('error');
                                    // for (var z = 0; z < button_num; z++) {
                                    //     setTimeout(
                                    //         function() {
                                    //             Sounds.play("click");
                                    //         },
                                    //         z * 500
                                    //     );
                                    // }
                                }
                            
                            }
                        
                            // button up
                            else {
                            
                                if (button_num === Controls.xr_controller_button_mapping.trigger) {
                                    if (handedness === "right") {
                                        Controls.fire_event("onRightTriggerReleased", {controller: controller});
                                    } else if (handedness === "left") {
                                        Controls.fire_event("onLeftTriggerReleased", {controller: controller});
                                    }
                                }
                                // squeeze button
                                else if (button_num === Controls.xr_controller_button_mapping.squeeze) {
                                    if (handedness === "right") {
                                        Controls.fire_event("onRightSqueezeReleased", {controller: controller});
                                    } else if (handedness === "left") {
                                        Controls.fire_event("onLeftSqueezeReleased", {controller: controller});
                                    }
                                }
                                // a button
                                else if (button_num === Controls.xr_controller_button_mapping.a) {
                                    if (handedness === "right") {
                                        Controls.fire_event("onRightButtonAReleased", {controller: controller});
                                    } else if (handedness === "left") {
                                        Controls.fire_event("onLeftButtonAReleased", {controller: controller});
                                    }
                                }
                                // b button
                                else if (button_num === Controls.xr_controller_button_mapping.b) {
                                    if (handedness === "right") {
                                        Controls.fire_event("onRightButtonBReleased", {controller: controller});
                                    } else if (handedness === "left") {
                                        Controls.fire_event("onLeftButtonBReleased", {controller: controller});
                                    }
                                } else {
                                    Game.log("Unknown " + handedness + " button " + button_num + " released");
                                }
                            
                            }
                        }
                    });
                
                
                    // handlers for thumb joy sticks
                
                    // we only consider stick moved if it has moved beyond the minimum threshold from center,
                    // bc these seem to wander up to about .17 with no input
                    const min_value_threshold = 0.2;
                
                    let previous_stick_state = {
                        x: 0, // right/left
                        y: 0, // up/down
                    };
                
                    prev_controller_state.axis.forEach((value, i) => {
                        if (Math.abs(value) <= min_value_threshold) {
                            value = 0.0;
                        }
                        // left/right
                        if (i === 2) {
                            previous_stick_state.x = value;
                        }
                        // up/down
                        if (i === 3) {
                            previous_stick_state.y = value;
                        }
                    });
                
                    let current_stick_state = {
                        x: 0, // right/left
                        y: 0, // up/down
                    };
                
                    controller_sticks.forEach((value, i) => {
                        if (Math.abs(value) <= min_value_threshold) {
                            value = 0.0;
                        }
                        // left/right
                        if (i === 2) {
                            current_stick_state.x = value;
                        }
                        // up/down
                        if (i === 3) {
                            current_stick_state.y = value;
                        }
                    });
                
                    if (
                        previous_stick_state.x !== current_stick_state.x
                        || previous_stick_state.y !== current_stick_state.y
                    ) {
                        if (handedness === "right") {
                            Controls.fire_event("onRightStickChanged", {value: current_stick_state});
                        } else {
                            Controls.fire_event("onLeftStickChanged", {value: current_stick_state});
                        }
                    }
    
                    // TODO: only fire this if the controller actually moved maybe?
                    Controls.fire_event("onControllerMove", {controller: controller});
                    
                    controller_num++;
                }
            
                Controls.fire_xr_controller_events.prev_controller_states.set(source, {
                    buttons: controller_buttons,
                    axis: controller_sticks
                });
            }
        }
    
        static fire_mouse_move_event(event) {
            // check for an item the mouse is pointing to that needs to be set as the targeted item
            // xr controller and mouse pointed would conflict, so we only use this outside of an xr session
            if (Game.renderer.xr.isPresenting) {
                return;
            }
            Controls.fire_event("onMouseMove", event);
        }
    
        static fire_mouse_click_event(event) {
            event.preventDefault();
            switch (event.which) {
                case 1:
                    Controls.fire_event("onMouseLeftClick", event);
                    break;
                case 2:
                    Controls.fire_event("onMouseMiddleClick", event);
                    break;
                case 3:
                    Controls.fire_event("onMouseRightClick", event);
                    break;
                default:
                    break;
            }
        }
    }
    
    
    class Sounds {
    
        static sounds = {};
        
        static init() {
            let sounds = {
                "delete_block": {
                    url: 'pop-sound.wav',
                },
                "place_block": {
                    url: 'door-wooden-close.wav',
                },
                "click": {
                    url: 'click.wav',
                    volume: 0.1,
                },
                "click2": {
                    url: 'click2.wav',
                    volume: 0.1,
                },
                "error": {
                    url: 'error.wav',
                },
            };
        
            for (const sound_name in sounds) {
                let sound_info = sounds[sound_name];
                Sounds.sounds[sound_name] = new Sounds(sound_name, sound_info);
            }
        }
    
        static play(identifier) {
            if (!Game.config.sound) {
                return;
            }
            Sounds.sounds[identifier]._play();
        }
    
        identifier;
        el;
        
        constructor (identifier, config) {
            this.el = document.createElement('audio');
            this.el.setAttribute('src', Game.config.assets_dir + "/" + config.url);
            if (config.volume) {
                this.el.volume = config.volume;
            } else {
                this.el.volume = 1;
            }
            if (config.loop) {
                this.el.loop = config.loop;
            }
        }
    
        _play() {
            this.el.play();
        }
    
    }
    
    class Keyboard {
        
        static keys_down = {};
    

        static keys = {
            up: "arrowup",
            down: "arrowdown",
            rotateright: "arrowleft",
            rotateleft: "arrowright",
        
            right: "d",
            left: "a",
            forward: "w",
            backward: "s",
            change_working_block_type_identifier: "i",
        }
        
        static init() {
        
            // don't use a keyboard on a vr headset
            if (Game.config.on_vr_headset) {
                return;
            }
        
            document.addEventListener('keydown', (event) => {
                try {
                    const keyName = event.key.toLowerCase();
                    if (Keyboard.keys_down[keyName]) {
                        return;
                    }
                    Keyboard.keys_down[keyName] = true;
                    // Game.log(keyName);
                
                    if (keyName === Keyboard.keys.forward) {
                        Player.change_forward_velocity(-1)
                    }
                    if (keyName === Keyboard.keys.backward) {
                        Player.change_forward_velocity(1)
                    }
                    if (keyName === Keyboard.keys.right) {
                        Player.change_sideways_velocity(1)
                    }
                    if (keyName === Keyboard.keys.left) {
                        Player.change_sideways_velocity(-1)
                    }
                    if (keyName === Keyboard.keys.up) {
                        Player.change_verticle_velocity(1)
                    }
                    if (keyName === Keyboard.keys.down) {
                        Player.change_verticle_velocity(-1)
                    }
                    if (keyName === Keyboard.keys.rotateleft) {
                        Player.change_rotation_velocity(1)
                    }
                    if (keyName === Keyboard.keys.rotateright) {
                        Player.change_rotation_velocity(-1)
                    }
                    if (keyName === Keyboard.keys.change_working_block_type_identifier) {
                        SelectBlockControlPanel.toggle();
                    }
                }
                catch (err) {
                    Game.handle_error(err);
                }
            
            }, false);
        
            document.addEventListener('keyup', (event) => {
                try {
                    const keyName = event.key.toLowerCase();
                    Keyboard.keys_down[keyName] = false;
                
                    if (
                        keyName === Keyboard.keys.right
                        || keyName === Keyboard.keys.left
                    ) {
                        Player.change_sideways_velocity(0)
                    }
                    if (
                        keyName === Keyboard.keys.forward
                        || keyName === Keyboard.keys.backward
                    ) {
                        Player.change_forward_velocity(0)
                    }
                    if (
                        keyName === Keyboard.keys.up
                        || keyName === Keyboard.keys.down
                    ) {
                        Player.change_verticle_velocity(0)
                    }
                    if (
                        keyName === Keyboard.keys.rotateright
                        || keyName === Keyboard.keys.rotateleft
                    ) {
                        Player.change_rotation_velocity(0)
                    }
                }
                catch (err) {
                    Game.handle_error(err);
                }
            }, false);
        
        }
        
    }
    
    class Headset {
        
        static get_world_horizontal_rotation_angle() {
            let direction = Headset.get_world_direction();
            return (Math.atan2(direction.x, direction.z)) + Math.PI;
        }
        
        static _local_position = new THREE.Vector3();
        static get_local_position() {
            if (!Game.renderer.xr.isPresenting) {
                // Player.camera.position is local pos when not in xr session
                return Player.camera.position;
            }
            
            // during xr session, Player.camera.position contains the world position
            // To get local, we convert Player.camera.position
            Headset._local_position.copy(Player.camera.position);
            Player.group.updateWorldMatrix();
            Player.group.worldToLocal(Headset._local_position);
            return Headset._local_position;
        }
        
        static _world_position = new THREE.Vector3();
        static get_world_position() {
    
            // during xr session, Player.camera.position contains the world position
            if (Game.renderer.xr.isPresenting) {
                return Player.camera.position;
            }
            
            // outside of xr session, Player.camera.position contains the local position
            // To get world, we convert from Player.camera.position
            Headset._world_position.copy(Player.camera.position)
            Player.group.updateWorldMatrix();
            Player.group.localToWorld(Headset._world_position);
            return Headset._world_position;
        }
        
        static get_local_rotation() {
            
            if (typeof Headset.get_local_rotation.init === "undefined") {
                Headset.get_local_rotation.init = true;
                Headset.get_local_rotation.camera_group_diff_quaternion = new THREE.Quaternion();
                Headset.get_local_rotation.player_group_quaternion = new THREE.Quaternion();
                Headset.get_local_rotation.local_rotation = new THREE.Euler();
            }
            let camera_group_diff_quaternion = Headset.get_local_position.camera_group_diff_quaternion;
            let player_group_quaternion = Headset.get_local_position.player_group_quaternion;
            let local_rotation = Headset.get_local_position.local_rotation;
            
            Player.group.getWorldQuaternion(player_group_quaternion);
            player_group_quaternion.invert();
            camera_group_diff_quaternion.multiplyQuaternions(Player.camera.quaternion, player_group_quaternion);
            local_rotation.setFromQuaternion(camera_group_diff_quaternion);
            return {
                x: local_rotation.x,
                y: local_rotation.y,
                z: local_rotation.z,
            };
        }
        
        static get_world_rotation() {
            if (Game.renderer.xr.isPresenting) {
                return Player.camera.rotation;
            }
            else {
                return Player.group.rotation;
            }
        }
        
        static _world_direction = new THREE.Vector3();
        static get_world_direction() {
            if (Game.renderer.xr.isPresenting) {
                Game.renderer.xr.getCamera(Player.camera).getWorldDirection(Headset._world_direction);
                return Headset._world_direction
            }
            else {
                Player.camera.getWorldDirection(Headset._world_direction);
                return Headset._world_direction
            }
        }
        
    }
    
    class Utils {
    
        static get_random_number(min, max) {
            min = Math.ceil(min);
            max = Math.floor(max);
            return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
        }
        
        static get_xyz_string(p, decimal_places = 2) {
            let x, y, z;
            if (Array.isArray(p)) {
                x = p[0];
                y = p[1];
                z = p[2];
            }
            else {
                x = p.x;
                y = p.y;
                z = p.z;
            }
            if (decimal_places !== null) {
                let r = Math.pow(10, decimal_places);
                x = Math.round(x * r) / r;
                y = Math.round(y * r) / r;
                z = Math.round(z * r) / r;
            }
            return "" + x + ", " + y + ", " + z;
        }
    
        static get_horizontal_rotation_angle(object_or_direction) {
            if (typeof Utils.get_horizontal_rotation_angle.direction === "undefined") {
                Utils.get_horizontal_rotation_angle.direction = new THREE.Vector3();
                Utils.get_horizontal_rotation_angle.matrix = new THREE.Matrix4();
            }
            let direction = Utils.get_horizontal_rotation_angle.direction;
            let matrix = Utils.get_horizontal_rotation_angle.matrix;

            if (typeof object_or_direction.rotation === "undefined") {
                direction.set(0 - object_or_direction.x, 0 - object_or_direction.y, 0 - object_or_direction.z);
            }
            else {
                // extract direction vector from the given object's rotation
                matrix.extractRotation( object_or_direction.matrix );
                direction.set(0,0,1);
                direction.applyMatrix4( matrix );
            }

            let a = Math.atan2(direction.x, direction.z);
            if (a < 0) {
                a += (Math.PI * 2);
            }
            return a;
        }
    
        static get_horizontal_direction_vector(angle) {

            angle -= Math.PI;

            if (typeof Utils.get_horizontal_direction_vector.direction === "undefined") {
                Utils.get_horizontal_direction_vector.direction = new THREE.Vector3();
            }
            let direction = Utils.get_horizontal_direction_vector.direction;
    
            direction.x = Math.sin(angle);
            direction.y = 0;
            direction.z = Math.cos(angle);

            return direction;
            
        }
        
    }
    
    Game.run(options);
    
})($);



