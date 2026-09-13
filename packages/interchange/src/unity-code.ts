export const UNITY_IDENTITY = `using UnityEngine;

namespace ProtoMake.Generated
{
    [DisallowMultipleComponent]
    public sealed class ProtoMakeIdentity : MonoBehaviour
    {
        public string protomakeId = "";
        public string[] tags = new string[0];
        [TextArea] public string componentJson = "[]";

        public static GameObject Find(string id)
        {
            foreach (ProtoMakeIdentity identity in Object.FindObjectsOfType<ProtoMakeIdentity>(true))
                if (identity.protomakeId == id) return identity.gameObject;
            return null;
        }

        public void ProtoMakeAnimationEvent(string payload)
        {
            gameObject.SendMessage("OnProtoMakeAnimationEvent", payload, SendMessageOptions.DontRequireReceiver);
        }
    }
}
`;

export const UNITY_GRAPH_RUNTIME = `using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.InputSystem;

namespace ProtoMake.Generated
{
    public sealed class ProtoMakeGraphBehaviour : MonoBehaviour
    {
        public TextAsset graphAsset;
        public InputActionAsset inputActions;
        public string protomakeEntityId = "";
        [TextArea] public string overridesJson = "{}";
        JObject graph;
        readonly Dictionary<string, JToken> variables = new Dictionary<string, JToken>();
        readonly HashSet<string> once = new HashSet<string>();
        int steps;

        void Awake()
        {
            if (graphAsset == null) return;
            graph = JObject.Parse(graphAsset.text);
            JObject definitions = graph["variables"] as JObject;
            if (definitions != null)
                foreach (JProperty item in definitions.Properties())
                    variables[item.Name] = item.Value["default"] != null ? item.Value["default"].DeepClone() : JValue.CreateNull();
            JObject supplied = string.IsNullOrWhiteSpace(overridesJson) ? null : JObject.Parse(overridesJson);
            if (supplied != null)
                foreach (JProperty item in supplied.Properties()) variables[item.Name] = item.Value.DeepClone();
            if (inputActions != null) inputActions.Enable();
        }

        void Start() { Fire("event.start"); }
        void Update() { Fire("event.update"); }
        void FixedUpdate() { Fire("event.fixedUpdate"); }

        void Fire(string type)
        {
            if (graph == null) return;
            steps = 0;
            foreach (JObject node in graph["nodes"] as JArray)
                if ((string)node["type"] == type) Flow(node, "out");
        }

        void Flow(JObject source, string port)
        {
            if (++steps > 1024) throw new InvalidOperationException("ProtoMake graph exceeded 1024 flow steps");
            foreach (JObject connection in graph["connections"] as JArray)
            {
                JObject origin = connection["fro" + "m"] as JObject;
                if ((string)origin["node"] == (string)source["id"] && (string)origin["port"] == port)
                    Execute(Node((string)connection["to"]["node"]));
            }
        }

        void Execute(JObject node)
        {
            if (node == null) return;
            string type = (string)node["type"];
            if (type == "flow.branch") Flow(node, Truth(Input(node, "condition")) ? "true" : "false");
            else if (type == "flow.sequence") { Flow(node, "first"); Flow(node, "then"); }
            else if (type == "flow.once") { if (once.Add((string)node["id"])) Flow(node, "out"); }
            else if (type == "variable.set") { variables[(string)node["properties"]["name"] ?? ""] = Clone(Input(node, "value")); Flow(node, "out"); }
            else if (type == "transform.setPosition")
            {
                GameObject target = Entity(Input(node, "entity"));
                Vector2 value = Vector(Input(node, "position"));
                if (target != null) target.transform.position = new Vector3(ProtoMakeCoordinates.X(value.x), ProtoMakeCoordinates.Y(value.y), target.transform.position.z);
                Flow(node, "out");
            }
            else if (type == "physics.setVelocity")
            {
                GameObject target = Entity(Input(node, "entity"));
                Rigidbody2D body = target != null ? target.GetComponent<Rigidbody2D>() : null;
                Vector2 value = Vector(Input(node, "velocity"));
                if (body != null) body.velocity = new Vector2(ProtoMakeCoordinates.X(value.x), ProtoMakeCoordinates.Y(value.y));
                Flow(node, "out");
            }
            else if (type == "debug.log") { JToken value = Input(node, "message"); Debug.Log(value != null ? value.ToString() : (string)node["properties"]["message"]); Flow(node, "out"); }
        }

        JToken Value(JObject node, string port)
        {
            string type = (string)node["type"];
            if (type == "value.constant") return node["properties"]["value"];
            if (type == "variable.get") { JToken value; return variables.TryGetValue((string)node["properties"]["name"] ?? "", out value) ? value : JValue.CreateNull(); }
            if (type == "math.add") return new JValue(Number(Input(node, "a")) + Number(Input(node, "b")));
            if (type == "math.compare") return new JValue(Number(Input(node, "a")) >= Number(Input(node, "b")));
            if (type == "entity.self") return new JValue(protomakeEntityId);
            if (type == "transform.position")
            {
                GameObject target = Entity(Input(node, "entity"));
                Vector3 value = target != null ? target.transform.position : Vector3.zero;
                return new JArray(ProtoMakeCoordinates.PixelsX(value.x), ProtoMakeCoordinates.PixelsY(value.y));
            }
            if (type == "input.axis")
            {
                InputAction action = Action((string)node["properties"]["action"]);
                return new JValue(action != null ? action.ReadValue<float>() : 0f);
            }
            if (type == "input.vector2")
            {
                InputAction action = Action((string)node["properties"]["action"]);
                Vector2 value = action != null ? action.ReadValue<Vector2>() : Vector2.zero;
                return new JArray(value.x, value.y);
            }
            if (type == "physics.velocity")
            {
                GameObject target = Entity(Input(node, "entity"));
                Rigidbody2D body = target != null ? target.GetComponent<Rigidbody2D>() : null;
                Vector2 value = body != null ? body.velocity : Vector2.zero;
                return new JArray(ProtoMakeCoordinates.PixelsX(value.x), ProtoMakeCoordinates.PixelsY(value.y));
            }
            return JValue.CreateNull();
        }

        JToken Input(JObject node, string port)
        {
            foreach (JObject connection in graph["connections"] as JArray)
                if ((string)connection["to"]["node"] == (string)node["id"] && (string)connection["to"]["port"] == port)
                {
                    JObject origin = connection["fro" + "m"] as JObject;
                    return Value(Node((string)origin["node"]), (string)origin["port"]);
                }
            return node["properties"][port];
        }

        JObject Node(string id)
        {
            foreach (JObject node in graph["nodes"] as JArray) if ((string)node["id"] == id) return node;
            return null;
        }

        GameObject Entity(JToken token)
        {
            string id = token == null || token.Type == JTokenType.Null || string.IsNullOrEmpty((string)token) ? protomakeEntityId : (string)token;
            return ProtoMakeIdentity.Find(id);
        }

        InputAction Action(string name) { return inputActions != null ? inputActions.FindAction(name, false) : null; }
        static float Number(JToken token) { return token == null || token.Type == JTokenType.Null ? 0f : token.Value<float>(); }
        static bool Truth(JToken token) { return token != null && token.Type != JTokenType.Null && token.Value<bool>(); }
        static JToken Clone(JToken token) { return token != null ? token.DeepClone() : JValue.CreateNull(); }
        static Vector2 Vector(JToken token) { JArray value = token as JArray; return value != null && value.Count >= 2 ? new Vector2(Number(value[0]), Number(value[1])) : Vector2.zero; }
    }
}
`;

export const UNITY_IMPORTER = `using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using ProtoMake.Generated;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.SceneManagement;

namespace ProtoMake.Editor
{
    [InitializeOnLoad]
    public static class ProtoMakeImporter
    {
        const string Root = "Assets/Generated/ProtoMake";
        const string IrPath = Root + "/Data/protomake-ir.json";
        const string ManifestPath = Root + "/Data/export-manifest.json";
        static JObject project;
        static readonly Dictionary<string, JObject> AssetsById = new Dictionary<string, JObject>();
        static InputActionAsset inputActions;

        static ProtoMakeImporter() { EditorApplication.delayCall += ImportIfChanged; }

        [MenuItem("Tools/ProtoMake/Reimport")]
        public static void Import()
        {
            if (!File.Exists(IrPath)) return;
            project = JObject.Parse(File.ReadAllText(IrPath));
            AssetsById.Clear();
            foreach (JObject asset in project["assets"] as JArray) AssetsById[(string)asset["id"]] = asset;
            Directory.CreateDirectory(Root + "/Scenes");
            Directory.CreateDirectory(Root + "/Input");
            Directory.CreateDirectory(Root + "/Physics");
            AssetDatabase.Refresh();
            PrepareMedia();
            ConfigurePhysics();
            inputActions = BuildInput();
            PrepareAnimations();
            var scenePaths = new List<string>();
            foreach (JObject scene in project["scenes"] as JArray) scenePaths.Add(BuildScene(scene));
            EditorBuildSettings.scenes = scenePaths.Select(path => new EditorBuildSettingsScene(path, true)).ToArray();
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            StoreHash();
            Debug.Log("ProtoMake import complete: " + scenePaths.Count + " scene(s). Review " + Root + "/Data/portability-report.json");
        }

        static void ImportIfChanged()
        {
            if (!File.Exists(IrPath) || !File.Exists(ManifestPath)) return;
            string hash = (string)JObject.Parse(File.ReadAllText(ManifestPath))["sourceHash"];
            if (EditorPrefs.GetString(HashKey(), "") != hash) Import();
        }

        static string HashKey() { return "ProtoMake.Interchange." + Application.dataPath; }
        static void StoreHash()
        {
            if (File.Exists(ManifestPath))
                EditorPrefs.SetString(HashKey(), (string)JObject.Parse(File.ReadAllText(ManifestPath))["sourceHash"]);
        }

        static string BuildScene(JObject source)
        {
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var entities = new Dictionary<string, GameObject>();
            foreach (JObject entity in source["entities"] as JArray)
            {
                var gameObject = new GameObject((string)entity["name"]);
                var identity = gameObject.AddComponent<ProtoMakeIdentity>();
                identity.protomakeId = (string)entity["id"];
                identity.componentJson = entity["components"].ToString(Formatting.None);
                JObject tags = Component(entity, "protomake.tags");
                identity.tags = tags != null && tags["tags"] is JArray ? tags["tags"].Values<string>().ToArray() : new string[0];
                gameObject.SetActive((bool)entity["enabled"]);
                entities[identity.protomakeId] = gameObject;
            }
            foreach (JObject entity in source["entities"] as JArray)
            {
                GameObject gameObject = entities[(string)entity["id"]];
                string parent = (string)entity["parent"];
                if (!string.IsNullOrEmpty(parent) && entities.ContainsKey(parent)) gameObject.transform.SetParent(entities[parent].transform, false);
                ApplyTransform(gameObject.transform, entity["transform"] as JArray);
                ApplyComponents(gameObject, entity);
            }
            string path = Root + "/Scenes/" + Safe((string)source["name"]) + "-" + Short((string)source["id"]) + ".unity";
            EditorSceneManager.SaveScene(scene, path);
            return path;
        }

        static void ApplyTransform(Transform target, JArray matrix)
        {
            float a = F(matrix[0]), b = F(matrix[1]), c = F(matrix[2]), d = F(matrix[3]);
            float scaleX = Mathf.Sqrt(a * a + b * b);
            float scaleY = scaleX < 0.000001f ? Mathf.Sqrt(c * c + d * d) : (a * d - b * c) / scaleX;
            float angle = scaleX < 0.000001f ? Mathf.Atan2(-c, d) : Mathf.Atan2(b, a);
            target.localPosition = new Vector3(ProtoMakeCoordinates.X(F(matrix[4])), ProtoMakeCoordinates.Y(F(matrix[5])), 0f);
            target.localEulerAngles = new Vector3(0f, 0f, ProtoMakeCoordinates.Degrees(angle));
            target.localScale = new Vector3(scaleX, scaleY, 1f);
        }

        static void ApplyComponents(GameObject gameObject, JObject entity)
        {
            JObject bodyData = Component(entity, "protomake.rigidbody");
            Rigidbody2D body = null;
            if (bodyData != null) body = AddBody(gameObject, bodyData);
            else if (Component(entity, "protomake.character-body") != null)
            {
                body = gameObject.AddComponent<Rigidbody2D>();
                body.bodyType = RigidbodyType2D.Kinematic;
                body.gravityScale = 0f;
            }
            foreach (JObject item in entity["components"] as JArray)
            {
                string type = (string)item["type"];
                JObject data = item["data"] as JObject;
                if (type == "protomake.sprite") AddSprite(gameObject, data);
                else if (type == "protomake.camera") AddCamera(gameObject, data);
                else if (type == "protomake.audio-source") AddAudio(gameObject, data);
                else if (type == "protomake.animator") AddAnimator(gameObject, data);
                else if (type == "protomake.box-collider") AddBox(gameObject, data);
                else if (type == "protomake.circle-collider") AddCircle(gameObject, data);
                else if (type == "protomake.capsule-collider") AddCapsule(gameObject, data);
                else if (type == "protomake.behaviours") AddGraphs(gameObject, entity, data);
                else if (type == "protomake.particle-emitter") AddParticles(gameObject, data);
            }
        }

        static Rigidbody2D AddBody(GameObject gameObject, JObject data)
        {
            var body = gameObject.AddComponent<Rigidbody2D>();
            string mode = S(data, "mode", "dynamic");
            body.bodyType = mode == "static" ? RigidbodyType2D.Static : mode == "kinematic" ? RigidbodyType2D.Kinematic : RigidbodyType2D.Dynamic;
            body.mass = F(data, "mass", 1f);
            body.gravityScale = F(data, "gravityScale", 1f);
            body.drag = F(data, "linearDamping");
            body.angularDrag = F(data, "angularDamping");
            body.constraints = B(data, "freezeRotation", true) ? RigidbodyConstraints2D.FreezeRotation : RigidbodyConstraints2D.None;
            body.collisionDetectionMode = B(data, "continuous", true) ? CollisionDetectionMode2D.Continuous : CollisionDetectionMode2D.Discrete;
            body.velocity = new Vector2(ProtoMakeCoordinates.X(F(data, "velocityX")), ProtoMakeCoordinates.Y(F(data, "velocityY")));
            body.angularVelocity = ProtoMakeCoordinates.Degrees(F(data, "angularVelocity"));
            return body;
        }

        static void AddSprite(GameObject gameObject, JObject data)
        {
            JObject asset = Asset(S(data, "texture"));
            JObject source = ResolveImage(asset);
            var renderer = gameObject.AddComponent<SpriteRenderer>();
            if (source != null) renderer.sprite = AssetDatabase.LoadAssetAtPath<Sprite>(MediaPath(source));
            renderer.color = ColorWithAlpha(S(data, "tint", "#ffffff"), F(data, "opacity", 1f));
            renderer.flipX = B(data, "flipX");
            renderer.flipY = B(data, "flipY");
            renderer.sortingOrder = (int)F(data, "layer") * 1000 + (int)F(data, "order");
            renderer.drawMode = SpriteDrawMode.Sliced;
            renderer.size = new Vector2(ProtoMakeCoordinates.Length(F(data, "width", 64f)), ProtoMakeCoordinates.Length(F(data, "height", 64f)));
            renderer.enabled = B(data, "visible", true);
        }

        static void AddCamera(GameObject gameObject, JObject data)
        {
            Camera camera = gameObject.AddComponent<Camera>();
            camera.orthographic = true;
            camera.orthographicSize = 3.6f / Mathf.Max(.0001f, F(data, "zoom", 1f));
            camera.backgroundColor = ColorWithAlpha(S(data, "background", "#101820"), 1f);
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.depth = F(data, "priority");
            if (Camera.main == null) gameObject.tag = "MainCamera";
        }

        static void AddAudio(GameObject gameObject, JObject data)
        {
            var source = gameObject.AddComponent<AudioSource>();
            JObject clip = Asset(S(data, "clip"));
            if (clip != null) source.clip = AssetDatabase.LoadAssetAtPath<AudioClip>(MediaPath(clip));
            source.loop = B(data, "loop");
            source.volume = F(data, "volume", 1f);
            source.pitch = F(data, "rate", 1f);
            source.playOnAwake = B(data, "playOnAwake");
            source.spatialBlend = B(data, "spatial") ? 1f : 0f;
            source.minDistance = ProtoMakeCoordinates.Length(F(data, "minDistance", 64f));
            source.maxDistance = ProtoMakeCoordinates.Length(F(data, "maxDistance", 800f));
            source.panStereo = F(data, "pan");
            source.rolloffMode = AudioRolloffMode.Logarithmic;
        }

        static void AddAnimator(GameObject gameObject, JObject data)
        {
            string controller = S(data, "controller");
            if (string.IsNullOrEmpty(controller)) return;
            var animator = gameObject.AddComponent<Animator>();
            animator.runtimeAnimatorController = AssetDatabase.LoadAssetAtPath<RuntimeAnimatorController>(AnimationPath(controller, ".controller"));
            animator.speed = F(data, "speed", 1f);
        }

        static void AddBox(GameObject gameObject, JObject data)
        {
            var collider = gameObject.AddComponent<BoxCollider2D>();
            CommonCollider(collider, data);
            collider.size = new Vector2(ProtoMakeCoordinates.Length(F(data, "width", 64f)), ProtoMakeCoordinates.Length(F(data, "height", 64f)));
        }

        static void AddCircle(GameObject gameObject, JObject data)
        {
            var collider = gameObject.AddComponent<CircleCollider2D>();
            CommonCollider(collider, data);
            collider.radius = ProtoMakeCoordinates.Length(F(data, "radius", 32f));
        }

        static void AddCapsule(GameObject gameObject, JObject data)
        {
            var collider = gameObject.AddComponent<CapsuleCollider2D>();
            CommonCollider(collider, data);
            float radius = F(data, "radius", 16f), half = F(data, "halfHeight", 16f);
            collider.size = new Vector2(ProtoMakeCoordinates.Length(radius * 2f), ProtoMakeCoordinates.Length((radius + half) * 2f));
        }

        static void CommonCollider(Collider2D collider, JObject data)
        {
            collider.offset = new Vector2(ProtoMakeCoordinates.X(F(data, "offsetX")), ProtoMakeCoordinates.Y(F(data, "offsetY")));
            collider.isTrigger = B(data, "sensor");
            int layer = Mathf.Clamp((int)F(data, "layer"), 0, 15);
            collider.gameObject.layer = 8 + layer;
            if (B(data, "oneWay"))
            {
                collider.usedByEffector = true;
                collider.gameObject.AddComponent<PlatformEffector2D>();
            }
            var material = new PhysicsMaterial2D(collider.gameObject.name + " ProtoMake Material");
            material.friction = F(data, "friction", .5f);
            material.bounciness = F(data, "restitution");
            string path = Root + "/Physics/" + collider.GetComponent<ProtoMakeIdentity>().protomakeId + "-" + collider.GetType().Name + ".physicsMaterial2D";
            AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(material, path);
            collider.sharedMaterial = material;
        }

        static void AddGraphs(GameObject gameObject, JObject entity, JObject data)
        {
            JObject items = data["items"] as JObject;
            foreach (JToken order in data["order"] as JArray)
            {
                JObject item = items[(string)order] as JObject;
                if ((string)item["kind"] != "graph") continue;
                var graph = gameObject.AddComponent<ProtoMakeGraphBehaviour>();
                graph.enabled = B(item, "enabled", true);
                graph.protomakeEntityId = (string)entity["id"];
                graph.graphAsset = AssetDatabase.LoadAssetAtPath<TextAsset>(Root + "/Data/graphs/" + (string)item["graph"] + ".json");
                graph.inputActions = inputActions;
                graph.overridesJson = item["values"].ToString(Formatting.None);
            }
        }

        static void AddParticles(GameObject gameObject, JObject data)
        {
            var particles = gameObject.AddComponent<ParticleSystem>();
            var main = particles.main;
            main.loop = B(data, "emitting", true);
            main.playOnAwake = B(data, "playOnAwake", true);
            main.startLifetime = new ParticleSystem.MinMaxCurve(F(data, "lifetimeMin", .3f), F(data, "lifetimeMax", .7f));
            main.startSpeed = new ParticleSystem.MinMaxCurve(ProtoMakeCoordinates.Length(F(data, "speedMin", 30f)), ProtoMakeCoordinates.Length(F(data, "speedMax", 90f)));
            main.startSize = ProtoMakeCoordinates.Length(F(data, "startSize", 12f));
            main.maxParticles = (int)F(data, "maxParticles", 256f);
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            var emission = particles.emission;
            emission.rateOverTime = F(data, "rate", 10f);
            int burst = (int)F(data, "burst");
            if (burst > 0) emission.SetBurst(0, new ParticleSystem.Burst(0f, (short)burst));
            var shape = particles.shape;
            shape.rotation = new Vector3(0f, 0f, F(data, "angle", -90f));
            shape.angle = F(data, "spread", 35f) * .5f;
            var force = particles.forceOverLifetime;
            force.enabled = true;
            force.x = ProtoMakeCoordinates.X(F(data, "gravityX"));
            force.y = ProtoMakeCoordinates.Y(F(data, "gravityY", 120f));
            var size = particles.sizeOverLifetime;
            size.enabled = true;
            float endRatio = F(data, "endSize", 2f) / Mathf.Max(.0001f, F(data, "startSize", 12f));
            size.size = new ParticleSystem.MinMaxCurve(1f, new AnimationCurve(new Keyframe(0f, 1f), new Keyframe(1f, endRatio)));
            if (!B(data, "playOnAwake", true)) particles.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
        }

        static InputActionAsset BuildInput()
        {
            string path = Root + "/Input/ProtoMakeInput.inputactions";
            AssetDatabase.DeleteAsset(path);
            var asset = ScriptableObject.CreateInstance<InputActionAsset>();
            foreach (JObject definition in project["input"] as JArray)
            {
                string mapName = S(definition, "map", "Gameplay");
                InputActionMap map = asset.FindActionMap(mapName, false) ?? asset.AddActionMap(mapName);
                string kind = S(definition, "kind", "button");
                InputAction action = map.AddAction(S(definition, "name"), kind == "button" ? InputActionType.Button : InputActionType.Value, expectedControlLayout: kind == "vector2" ? "Vector2" : kind == "axis" ? "Axis" : "Button");
                if (kind == "button") AddBindings(action, definition["positiveX"] as JArray);
                else if (kind == "axis")
                {
                    AddAxisComposites(action, definition["positiveX"] as JArray, definition["negativeX"] as JArray);
                    if (AllBindings(definition).Any(value => value.StartsWith("GamepadAxis"))) action.AddBinding("<Gamepad>/leftStick/x");
                }
                else
                {
                    AddVectorComposites(action, definition);
                    if (AllBindings(definition).Any(value => value.StartsWith("GamepadAxis"))) action.AddBinding("<Gamepad>/leftStick");
                }
            }
            AssetDatabase.CreateAsset(asset, path);
            return asset;
        }

        static void PrepareAnimations()
        {
            Directory.CreateDirectory(Root + "/Animations");
            foreach (JObject asset in AssetsById.Values)
                if ((string)asset["mime"] == "application/x-protomake-animation") BuildClip(asset);
            AssetDatabase.SaveAssets();
            foreach (JObject asset in AssetsById.Values)
                if ((string)asset["mime"] == "application/x-protomake-animator") BuildController(asset);
        }

        static void BuildClip(JObject asset)
        {
            JObject source = JObject.Parse((string)asset["data"]);
            string path = AnimationPath((string)asset["id"], ".anim");
            AssetDatabase.DeleteAsset(path);
            var clip = new AnimationClip();
            clip.name = S(source, "name", "ProtoMake Clip");
            clip.frameRate = 60f;
            var keys = new List<ObjectReferenceKeyframe>();
            float time = 0f;
            foreach (JObject frame in source["frames"] as JArray)
            {
                keys.Add(new ObjectReferenceKeyframe { time = time, value = ResolveSprite((string)frame["texture"]) });
                time += F(frame, "duration", 1f / 12f);
            }
            var binding = new EditorCurveBinding { path = "", type = typeof(SpriteRenderer), propertyName = "m_Sprite" };
            AnimationUtility.SetObjectReferenceCurve(clip, binding, keys.ToArray());
            AnimationClipSettings settings = AnimationUtility.GetAnimationClipSettings(clip);
            settings.loopTime = B(source, "loop", true);
            AnimationUtility.SetAnimationClipSettings(clip, settings);
            var events = new List<AnimationEvent>();
            foreach (JObject item in source["events"] as JArray)
                events.Add(new AnimationEvent { time = F(item, "time"), functionName = "ProtoMakeAnimationEvent", stringParameter = item["payload"] == null ? S(item, "name") : S(item, "name") + ":" + item["payload"].ToString(Formatting.None) });
            AnimationUtility.SetAnimationEvents(clip, events.ToArray());
            AssetDatabase.CreateAsset(clip, path);
        }

        static void BuildController(JObject asset)
        {
            JObject source = JObject.Parse((string)asset["data"]);
            string path = AnimationPath((string)asset["id"], ".controller");
            AssetDatabase.DeleteAsset(path);
            AnimatorController controller = AnimatorController.CreateAnimatorControllerAtPath(path);
            foreach (JProperty parameter in (source["parameters"] as JObject).Properties())
            {
                string type = (string)parameter.Value["type"];
                AnimatorControllerParameterType target = type == "bool" ? AnimatorControllerParameterType.Bool : type == "trigger" ? AnimatorControllerParameterType.Trigger : type == "int" ? AnimatorControllerParameterType.Int : AnimatorControllerParameterType.Float;
                controller.AddParameter(parameter.Name, target);
                AnimatorControllerParameter created = controller.parameters.First(value => value.name == parameter.Name);
                if (target == AnimatorControllerParameterType.Bool) created.defaultBool = (bool)parameter.Value["default"];
                else if (target == AnimatorControllerParameterType.Int) created.defaultInt = (int)parameter.Value["default"];
                else if (target == AnimatorControllerParameterType.Float) created.defaultFloat = (float)parameter.Value["default"];
            }
            AnimatorStateMachine machine = controller.layers[0].stateMachine;
            var states = new Dictionary<string, AnimatorState>();
            foreach (JObject definition in source["states"] as JArray)
            {
                AnimatorState state = machine.AddState(S(definition, "name"));
                JObject clipAsset = Asset(S(definition, "clip"));
                state.motion = clipAsset == null ? null : AssetDatabase.LoadAssetAtPath<AnimationClip>(AnimationPath((string)clipAsset["id"], ".anim"));
                float clipSpeed = clipAsset == null ? 1f : F(JObject.Parse((string)clipAsset["data"]), "speed", 1f);
                state.speed = F(definition, "speed", 1f) * clipSpeed;
                states[state.name] = state;
                if (state.name == S(source, "initial")) machine.defaultState = state;
            }
            foreach (JObject definition in source["transitions"] as JArray)
            {
                AnimatorState destination;
                if (!states.TryGetValue(S(definition, "to"), out destination)) continue;
                AnimatorStateTransition transition = S(definition, "fro" + "m") == "*" ? machine.AddAnyStateTransition(destination) : states[S(definition, "fro" + "m")].AddTransition(destination);
                transition.duration = F(definition, "blend");
                transition.hasExitTime = definition["exitTime"].Type != JTokenType.Null;
                if (transition.hasExitTime) transition.exitTime = F(definition["exitTime"]);
                foreach (JObject condition in definition["conditions"] as JArray) AddCondition(transition, condition, source["parameters"][(string)condition["parameter"]] as JObject);
            }
            EditorUtility.SetDirty(controller);
        }

        static void AddCondition(AnimatorStateTransition transition, JObject condition, JObject parameter)
        {
            string name = S(condition, "parameter"), op = S(condition, "operator"), type = S(parameter, "type");
            if (type == "trigger") transition.AddCondition(AnimatorConditionMode.If, 0f, name);
            else if (type == "bool")
            {
                bool expected = (bool)condition["value"];
                if (op == "!=") expected = !expected;
                transition.AddCondition(expected ? AnimatorConditionMode.If : AnimatorConditionMode.IfNot, 0f, name);
            }
            else
            {
                float value = F(condition["value"]);
                transition.AddCondition(op == "<" || op == "<=" ? AnimatorConditionMode.Less : op == "==" ? AnimatorConditionMode.Equals : op == "!=" ? AnimatorConditionMode.NotEqual : AnimatorConditionMode.Greater, value, name);
            }
        }

        static Sprite ResolveSprite(string id)
        {
            JObject asset = Asset(id), source = ResolveImage(asset);
            return source == null ? null : AssetDatabase.LoadAssetAtPath<Sprite>(MediaPath(source));
        }

        static string AnimationPath(string id, string extension) { return Root + "/Animations/" + id + extension; }

        static void ConfigurePhysics()
        {
            JObject physics = project["physics"] as JObject;
            Physics2D.gravity = new Vector2(ProtoMakeCoordinates.X(F(physics, "gravityX")), ProtoMakeCoordinates.Y(F(physics, "gravityY", 980f)));
            UnityEngine.Object[] managers = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/TagManager.asset");
            if (managers.Length > 0)
            {
                var settings = new SerializedObject(managers[0]);
                SerializedProperty layers = settings.FindProperty("layers");
                JArray names = physics["layers"] as JArray;
                for (int index = 0; index < names.Count && index < 16; index++) layers.GetArrayElementAtIndex(8 + index).stringValue = (string)names[index];
                settings.ApplyModifiedProperties();
            }
            JArray matrix = physics["matrix"] as JArray;
            for (int row = 0; row < matrix.Count && row < 16; row++)
                for (int column = row; column < (matrix[row] as JArray).Count && column < 16; column++)
                    Physics2D.IgnoreLayerCollision(8 + row, 8 + column, !(bool)matrix[row][column]);
        }

        static IEnumerable<string> AllBindings(JObject definition)
        {
            foreach (string key in new[] { "positiveX", "negativeX", "positiveY", "negativeY" })
                foreach (string value in definition[key].Values<string>()) yield return value;
        }

        static void AddBindings(InputAction action, JArray values)
        {
            foreach (string value in values.Values<string>())
            {
                string path = Binding(value);
                if (path != null) action.AddBinding(path);
            }
        }

        static void AddAxisComposites(InputAction action, JArray positive, JArray negative)
        {
            string[] positives = positive.Values<string>().Where(value => !value.StartsWith("Gamepad")).ToArray();
            string[] negatives = negative.Values<string>().Where(value => !value.StartsWith("Gamepad")).ToArray();
            int count = Math.Max(positives.Length, negatives.Length);
            for (int index = 0; index < count; index++)
            {
                InputActionSetupExtensions.CompositeSyntax composite = action.AddCompositeBinding("1DAxis");
                AddPart(composite, "Positive", positives, index);
                AddPart(composite, "Negative", negatives, index);
            }
        }

        static void AddVectorComposites(InputAction action, JObject definition)
        {
            string[] right = KeyboardBindings(definition["positiveX"] as JArray), left = KeyboardBindings(definition["negativeX"] as JArray);
            string[] down = KeyboardBindings(definition["positiveY"] as JArray), up = KeyboardBindings(definition["negativeY"] as JArray);
            int count = Math.Max(Math.Max(right.Length, left.Length), Math.Max(down.Length, up.Length));
            for (int index = 0; index < count; index++)
            {
                InputActionSetupExtensions.CompositeSyntax composite = action.AddCompositeBinding("2DVector");
                AddPart(composite, "Right", right, index);
                AddPart(composite, "Left", left, index);
                AddPart(composite, "Down", down, index);
                AddPart(composite, "Up", up, index);
            }
        }

        static string[] KeyboardBindings(JArray values) { return values.Values<string>().Where(value => !value.StartsWith("Gamepad")).ToArray(); }

        static void AddPart(InputActionSetupExtensions.CompositeSyntax composite, string part, string[] values, int index)
        {
            if (index >= values.Length) return;
            string path = Binding(values[index]);
            if (path != null) composite.With(part, path);
        }

        static string Binding(string value)
        {
            if (string.IsNullOrEmpty(value)) return null;
            if (value.StartsWith("Key")) return "<Keyboard>/" + value.Substring(3).ToLowerInvariant();
            if (value.StartsWith("Digit")) return "<Keyboard>/" + value.Substring(5);
            if (value == "Space") return "<Keyboard>/space";
            if (value == "Enter") return "<Keyboard>/enter";
            if (value.StartsWith("Arrow")) return "<Keyboard>/" + value.Substring(5).ToLowerInvariant() + "Arrow";
            if (value.StartsWith("Mouse")) return "<Mouse>/" + (value == "Mouse0" ? "leftButton" : value == "Mouse1" ? "rightButton" : "middleButton");
            if (value.StartsWith("GamepadButton"))
            {
                string index = value.Substring(13);
                return "<Gamepad>/" + (index == "0" ? "buttonSouth" : index == "1" ? "buttonEast" : index == "2" ? "buttonWest" : index == "3" ? "buttonNorth" : "buttonSouth");
            }
            return null;
        }

        static void PrepareMedia()
        {
            foreach (JObject asset in AssetsById.Values)
            {
                if ((string)asset["kind"] != "image") continue;
                string path = MediaPath(asset);
                TextureImporter importer = AssetImporter.GetAtPath(path) as TextureImporter;
                if (importer != null && (importer.textureType != TextureImporterType.Sprite || importer.spritePixelsPerUnit != ProtoMakeCoordinates.PixelsPerUnit))
                {
                    importer.textureType = TextureImporterType.Sprite;
                    importer.spriteImportMode = SpriteImportMode.Single;
                    importer.spritePixelsPerUnit = ProtoMakeCoordinates.PixelsPerUnit;
                    importer.mipmapEnabled = false;
                    importer.SaveAndReimport();
                }
            }
        }

        static JObject ResolveImage(JObject asset)
        {
            if (asset == null) return null;
            if ((string)asset["kind"] == "image") return asset;
            if ((string)asset["mime"] != "application/x-protomake-sprite-region") return null;
            JObject region = JObject.Parse((string)asset["data"]);
            return Asset((string)region["source"]);
        }

        static JObject Component(JObject entity, string type)
        {
            foreach (JObject item in entity["components"] as JArray) if ((string)item["type"] == type) return item["data"] as JObject;
            return null;
        }

        static JObject Asset(string id) { JObject value; return !string.IsNullOrEmpty(id) && AssetsById.TryGetValue(id, out value) ? value : null; }
        static string MediaPath(JObject asset) { return Root + "/Assets/" + (string)asset["id"] + Extension((string)asset["mime"]); }
        static string Extension(string mime) { return mime == "image/png" ? ".png" : mime == "image/jpeg" ? ".jpg" : mime == "image/webp" ? ".webp" : mime == "audio/wav" ? ".wav" : mime == "audio/mpeg" ? ".mp3" : mime == "audio/ogg" ? ".ogg" : ".json"; }
        static string Safe(string value) { string result = new string(value.Select(character => char.IsLetterOrDigit(character) || character == '_' || character == '-' ? character : '_').ToArray()).Trim('_'); return string.IsNullOrEmpty(result) ? "ProtoMake" : result; }
        static string Short(string value) { return value.Replace("-", "").Substring(0, 8); }
        static float F(JToken value) { return value == null ? 0f : value.Value<float>(); }
        static float F(JObject data, string key, float fallback = 0f) { return data[key] == null ? fallback : data[key].Value<float>(); }
        static bool B(JObject data, string key, bool fallback = false) { return data[key] == null ? fallback : data[key].Value<bool>(); }
        static string S(JObject data, string key, string fallback = "") { return data[key] == null ? fallback : data[key].Value<string>(); }
        static Color ColorWithAlpha(string html, float alpha) { Color value; if (!ColorUtility.TryParseHtmlString(html, out value)) value = Color.white; value.a = alpha; return value; }
    }
}
`;
