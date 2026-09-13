export const UNREAL_RUNTIME_BUILD = `using UnrealBuildTool;

public class ProtoMakeRuntime : ModuleRules
{
    public ProtoMakeRuntime(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine", "Json", "EnhancedInput", "Paper2D" });
    }
}
`;

export const UNREAL_EDITOR_BUILD = `using UnrealBuildTool;

public class ProtoMakeImporter : ModuleRules
{
    public ProtoMakeImporter(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine", "ProtoMakeRuntime" });
        PrivateDependencyModuleNames.AddRange(new[] { "AssetRegistry", "AssetTools", "ContentBrowser", "EnhancedInput", "Json", "JsonUtilities", "LevelEditor", "Paper2D", "Paper2DEditor", "Projects", "Slate", "SlateCore", "ToolMenus", "UnrealEd" });
    }
}
`;

export const UNREAL_IDENTITY_HEADER = `#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "ProtoMakeIdentityComponent.generated.h"

UCLASS(ClassGroup=(ProtoMake), meta=(BlueprintSpawnableComponent))
class PROTOMAKERUNTIME_API UProtoMakeIdentityComponent : public UActorComponent
{
    GENERATED_BODY()
public:
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="ProtoMake") FGuid ProtoMakeId;
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="ProtoMake") TArray<FName> ProtoMakeTags;
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="ProtoMake", meta=(MultiLine=true)) FString ComponentJson;

    static AActor* Find(const UWorld* World, const FGuid& Id);
};
`;

export const UNREAL_IDENTITY_CPP = `#include "ProtoMakeIdentityComponent.h"
#include "EngineUtils.h"

AActor* UProtoMakeIdentityComponent::Find(const UWorld* World, const FGuid& Id)
{
    if (!World || !Id.IsValid()) return nullptr;
    for (TActorIterator<AActor> It(World); It; ++It)
        if (const UProtoMakeIdentityComponent* Identity = It->FindComponentByClass<UProtoMakeIdentityComponent>())
            if (Identity->ProtoMakeId == Id) return *It;
    return nullptr;
}
`;

export const UNREAL_GRAPH_HEADER = `#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Dom/JsonObject.h"
#include "ProtoMakeGraphComponent.generated.h"

UCLASS(ClassGroup=(ProtoMake), meta=(BlueprintSpawnableComponent))
class PROTOMAKERUNTIME_API UProtoMakeGraphComponent : public UActorComponent
{
    GENERATED_BODY()
public:
    UProtoMakeGraphComponent();
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="ProtoMake") FString GraphFile;
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="ProtoMake") FGuid ProtoMakeEntityId;
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="ProtoMake", meta=(MultiLine=true)) FString OverridesJson = TEXT("{}");

protected:
    virtual void BeginPlay() override;
    virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

private:
    TSharedPtr<FJsonObject> Graph;
    TMap<FString, TSharedPtr<FJsonValue>> Variables;
    TSet<FString> Once;
    int32 Steps = 0;
    void Fire(const FString& Type);
    void Flow(const TSharedPtr<FJsonObject>& Source, const FString& Port);
    void Execute(const TSharedPtr<FJsonObject>& Node);
    TSharedPtr<FJsonValue> Value(const TSharedPtr<FJsonObject>& Node, const FString& Port);
    TSharedPtr<FJsonValue> Input(const TSharedPtr<FJsonObject>& Node, const FString& Port);
    TSharedPtr<FJsonObject> Node(const FString& Id) const;
    AActor* Entity(const TSharedPtr<FJsonValue>& Token) const;
};
`;

export const UNREAL_GRAPH_CPP = `#include "ProtoMakeGraphComponent.h"
#include "ProtoMakeCoordinates.h"
#include "ProtoMakeIdentityComponent.h"
#include "Components/PrimitiveComponent.h"
#include "EnhancedPlayerInput.h"
#include "GameFramework/PlayerController.h"
#include "InputAction.h"
#include "JsonObjectConverter.h"
#include "Misc/FileHelper.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

namespace
{
    double Number(const TSharedPtr<FJsonValue>& Value) { double Result = 0.0; return Value.IsValid() && Value->TryGetNumber(Result) ? Result : 0.0; }
    bool Truth(const TSharedPtr<FJsonValue>& Value) { bool Result = false; return Value.IsValid() && Value->TryGetBool(Result) && Result; }
    FVector2D Vector(const TSharedPtr<FJsonValue>& Value)
    {
        const TArray<TSharedPtr<FJsonValue>>* Values = nullptr;
        return Value.IsValid() && Value->TryGetArray(Values) && Values->Num() >= 2 ? FVector2D(Number((*Values)[0]), Number((*Values)[1])) : FVector2D::ZeroVector;
    }
    FString Safe(const FString& Source)
    {
        FString Result;
        for (TCHAR Character : Source) Result.AppendChar(FChar::IsAlnum(Character) || Character == '_' ? Character : '_');
        return Result.IsEmpty() ? TEXT("ProtoMake") : Result;
    }
}

UProtoMakeGraphComponent::UProtoMakeGraphComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
}

void UProtoMakeGraphComponent::BeginPlay()
{
    Super::BeginPlay();
    FString Source;
    if (!FFileHelper::LoadFileToString(Source, *GraphFile)) { UE_LOG(LogTemp, Error, TEXT("ProtoMake graph missing: %s"), *GraphFile); return; }
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Source);
    if (!FJsonSerializer::Deserialize(Reader, Graph) || !Graph.IsValid()) { UE_LOG(LogTemp, Error, TEXT("ProtoMake graph invalid: %s"), *GraphFile); return; }
    const TSharedPtr<FJsonObject>* Definitions = nullptr;
    if (Graph->TryGetObjectField(TEXT("variables"), Definitions))
        for (const TPair<FString, TSharedPtr<FJsonValue>>& Item : (*Definitions)->Values)
        {
            const TSharedPtr<FJsonObject>* Definition = nullptr;
            if (Item.Value->TryGetObject(Definition)) Variables.Add(Item.Key, (*Definition)->TryGetField(TEXT("default")));
        }
    TSharedPtr<FJsonObject> Overrides;
    if (FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(OverridesJson), Overrides) && Overrides.IsValid())
        for (const TPair<FString, TSharedPtr<FJsonValue>>& Item : Overrides->Values) Variables.Add(Item.Key, Item.Value);
    Fire(TEXT("event.start"));
}

void UProtoMakeGraphComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
    Fire(TEXT("event.update"));
    Fire(TEXT("event.fixedUpdate"));
}

void UProtoMakeGraphComponent::Fire(const FString& Type)
{
    if (!Graph.IsValid()) return;
    Steps = 0;
    const TArray<TSharedPtr<FJsonValue>>* Nodes = nullptr;
    if (!Graph->TryGetArrayField(TEXT("nodes"), Nodes)) return;
    for (const TSharedPtr<FJsonValue>& Item : *Nodes)
    {
        const TSharedPtr<FJsonObject>* Current = nullptr;
        if (Item->TryGetObject(Current) && (*Current)->GetStringField(TEXT("type")) == Type) Flow(*Current, TEXT("out"));
    }
}

void UProtoMakeGraphComponent::Flow(const TSharedPtr<FJsonObject>& Source, const FString& Port)
{
    if (++Steps > 1024) { UE_LOG(LogTemp, Error, TEXT("ProtoMake graph exceeded 1024 flow steps")); return; }
    const TArray<TSharedPtr<FJsonValue>>* Connections = nullptr;
    if (!Graph->TryGetArrayField(TEXT("connections"), Connections)) return;
    for (const TSharedPtr<FJsonValue>& Item : *Connections)
    {
        const TSharedPtr<FJsonObject>* Connection = nullptr;
        if (!Item->TryGetObject(Connection)) continue;
        const TSharedPtr<FJsonObject>* Origin = nullptr;
        const FString OriginField = FString(TEXT("fro")) + TEXT("m");
        if (!(*Connection)->TryGetObjectField(OriginField, Origin)) continue;
        if ((*Origin)->GetStringField(TEXT("node")) == Source->GetStringField(TEXT("id")) && (*Origin)->GetStringField(TEXT("port")) == Port)
        {
            const TSharedPtr<FJsonObject>* Target = nullptr;
            if ((*Connection)->TryGetObjectField(TEXT("to"), Target)) Execute(Node((*Target)->GetStringField(TEXT("node"))));
        }
    }
}

void UProtoMakeGraphComponent::Execute(const TSharedPtr<FJsonObject>& Current)
{
    if (!Current.IsValid()) return;
    const FString Type = Current->GetStringField(TEXT("type"));
    const TSharedPtr<FJsonObject>* Properties = nullptr;
    Current->TryGetObjectField(TEXT("properties"), Properties);
    if (Type == TEXT("flow.branch")) Flow(Current, Truth(Input(Current, TEXT("condition"))) ? TEXT("true") : TEXT("false"));
    else if (Type == TEXT("flow.sequence")) { Flow(Current, TEXT("first")); Flow(Current, TEXT("then")); }
    else if (Type == TEXT("flow.once")) { const FString Id = Current->GetStringField(TEXT("id")); if (!Once.Contains(Id)) { Once.Add(Id); Flow(Current, TEXT("out")); } }
    else if (Type == TEXT("variable.set")) { Variables.Add((*Properties)->GetStringField(TEXT("name")), Input(Current, TEXT("value"))); Flow(Current, TEXT("out")); }
    else if (Type == TEXT("transform.setPosition"))
    {
        if (AActor* Target = Entity(Input(Current, TEXT("entity")))) { const FVector2D Position = Vector(Input(Current, TEXT("position"))); Target->SetActorLocation(ProtoMakeCoordinates::Position(Position.X, Position.Y)); }
        Flow(Current, TEXT("out"));
    }
    else if (Type == TEXT("physics.setVelocity"))
    {
        if (AActor* Target = Entity(Input(Current, TEXT("entity")))) if (UPrimitiveComponent* Body = Target->FindComponentByClass<UPrimitiveComponent>()) { const FVector2D Velocity = Vector(Input(Current, TEXT("velocity"))); Body->SetPhysicsLinearVelocity(ProtoMakeCoordinates::Velocity(Velocity.X, Velocity.Y)); }
        Flow(Current, TEXT("out"));
    }
    else if (Type == TEXT("debug.log")) { const TSharedPtr<FJsonValue> Message = Input(Current, TEXT("message")); UE_LOG(LogTemp, Log, TEXT("ProtoMake: %s"), Message.IsValid() ? *Message->AsString() : *(*Properties)->GetStringField(TEXT("message"))); Flow(Current, TEXT("out")); }
}

TSharedPtr<FJsonValue> UProtoMakeGraphComponent::Value(const TSharedPtr<FJsonObject>& Current, const FString& Port)
{
    if (!Current.IsValid()) return MakeShared<FJsonValueNull>();
    const FString Type = Current->GetStringField(TEXT("type"));
    const TSharedPtr<FJsonObject>* Properties = nullptr;
    Current->TryGetObjectField(TEXT("properties"), Properties);
    if (Type == TEXT("value.constant")) return (*Properties)->TryGetField(TEXT("value"));
    if (Type == TEXT("variable.get")) { const TSharedPtr<FJsonValue>* Result = Variables.Find((*Properties)->GetStringField(TEXT("name"))); return Result ? *Result : MakeShared<FJsonValueNull>(); }
    if (Type == TEXT("math.add")) return MakeShared<FJsonValueNumber>(Number(Input(Current, TEXT("a"))) + Number(Input(Current, TEXT("b"))));
    if (Type == TEXT("math.compare")) return MakeShared<FJsonValueBoolean>(Number(Input(Current, TEXT("a"))) >= Number(Input(Current, TEXT("b"))));
    if (Type == TEXT("entity.self")) return MakeShared<FJsonValueString>(ProtoMakeEntityId.ToString(EGuidFormats::DigitsWithHyphensLower));
    if (Type == TEXT("transform.position"))
    {
        const AActor* Target = Entity(Input(Current, TEXT("entity"))); const FVector Position = Target ? Target->GetActorLocation() : FVector::ZeroVector;
        TArray<TSharedPtr<FJsonValue>> Result{ MakeShared<FJsonValueNumber>(ProtoMakeCoordinates::PixelsX(Position.X)), MakeShared<FJsonValueNumber>(ProtoMakeCoordinates::PixelsY(Position.Z)) }; return MakeShared<FJsonValueArray>(Result);
    }
    if (Type == TEXT("input.axis") || Type == TEXT("input.vector2"))
    {
        const FString ActionName = (*Properties)->GetStringField(TEXT("action"));
        const UInputAction* Action = LoadObject<UInputAction>(nullptr, *(TEXT("/Game/Generated/ProtoMake/Input/IA_") + Safe(ActionName) + TEXT(".IA_") + Safe(ActionName)));
        const APlayerController* Controller = GetWorld() ? GetWorld()->GetFirstPlayerController() : nullptr;
        const UEnhancedPlayerInput* PlayerInput = Controller ? Cast<UEnhancedPlayerInput>(Controller->PlayerInput) : nullptr;
        const FInputActionValue ActionValue = PlayerInput && Action ? PlayerInput->GetActionValue(Action) : FInputActionValue();
        if (Type == TEXT("input.axis")) return MakeShared<FJsonValueNumber>(ActionValue.Get<float>());
        const FVector2D VectorValue = ActionValue.Get<FVector2D>(); TArray<TSharedPtr<FJsonValue>> Result{ MakeShared<FJsonValueNumber>(VectorValue.X), MakeShared<FJsonValueNumber>(VectorValue.Y) }; return MakeShared<FJsonValueArray>(Result);
    }
    if (Type == TEXT("physics.velocity"))
    {
        const AActor* Target = Entity(Input(Current, TEXT("entity"))); const UPrimitiveComponent* Body = Target ? Target->FindComponentByClass<UPrimitiveComponent>() : nullptr; const FVector Velocity = Body ? Body->GetPhysicsLinearVelocity() : FVector::ZeroVector;
        TArray<TSharedPtr<FJsonValue>> Result{ MakeShared<FJsonValueNumber>(ProtoMakeCoordinates::PixelsX(Velocity.X)), MakeShared<FJsonValueNumber>(ProtoMakeCoordinates::PixelsY(Velocity.Z)) }; return MakeShared<FJsonValueArray>(Result);
    }
    return MakeShared<FJsonValueNull>();
}

TSharedPtr<FJsonValue> UProtoMakeGraphComponent::Input(const TSharedPtr<FJsonObject>& Current, const FString& Port)
{
    const TArray<TSharedPtr<FJsonValue>>* Connections = nullptr;
    if (Graph->TryGetArrayField(TEXT("connections"), Connections)) for (const TSharedPtr<FJsonValue>& Item : *Connections)
    {
        const TSharedPtr<FJsonObject>* Connection = nullptr; if (!Item->TryGetObject(Connection)) continue;
        const TSharedPtr<FJsonObject>* Target = nullptr; if (!(*Connection)->TryGetObjectField(TEXT("to"), Target)) continue;
        if ((*Target)->GetStringField(TEXT("node")) == Current->GetStringField(TEXT("id")) && (*Target)->GetStringField(TEXT("port")) == Port)
        {
            const TSharedPtr<FJsonObject>* Origin = nullptr; const FString OriginField = FString(TEXT("fro")) + TEXT("m");
            if ((*Connection)->TryGetObjectField(OriginField, Origin)) return Value(Node((*Origin)->GetStringField(TEXT("node"))), (*Origin)->GetStringField(TEXT("port")));
        }
    }
    const TSharedPtr<FJsonObject>* Properties = nullptr; return Current->TryGetObjectField(TEXT("properties"), Properties) ? (*Properties)->TryGetField(Port) : MakeShared<FJsonValueNull>();
}

TSharedPtr<FJsonObject> UProtoMakeGraphComponent::Node(const FString& Id) const
{
    const TArray<TSharedPtr<FJsonValue>>* Nodes = nullptr; if (!Graph->TryGetArrayField(TEXT("nodes"), Nodes)) return nullptr;
    for (const TSharedPtr<FJsonValue>& Item : *Nodes) { const TSharedPtr<FJsonObject>* Current = nullptr; if (Item->TryGetObject(Current) && (*Current)->GetStringField(TEXT("id")) == Id) return *Current; }
    return nullptr;
}

AActor* UProtoMakeGraphComponent::Entity(const TSharedPtr<FJsonValue>& Token) const
{
    FGuid Id = ProtoMakeEntityId; FString Text;
    if (Token.IsValid() && Token->TryGetString(Text) && !Text.IsEmpty()) FGuid::Parse(Text, Id);
    return UProtoMakeIdentityComponent::Find(GetWorld(), Id);
}
`;

export const UNREAL_RUNTIME_MODULE = `#include "Modules/ModuleManager.h"

IMPLEMENT_MODULE(FDefaultModuleImpl, ProtoMakeRuntime)
`;

export const UNREAL_EDITOR_HEADER = `#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

class FProtoMakeImporterModule : public IModuleInterface
{
public:
    virtual void StartupModule() override;
    virtual void ShutdownModule() override;
private:
    void RegisterMenus();
    void ImportIfChanged();
    void Import();
};
`;

export const UNREAL_EDITOR_CPP = `#include "ProtoMakeImporterModule.h"
#include "ProtoMakeCoordinates.h"
#include "ProtoMakeGraphComponent.h"
#include "ProtoMakeIdentityComponent.h"
#include "AssetImportTask.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "AssetToolsModule.h"
#include "Camera/CameraComponent.h"
#include "Components/AudioComponent.h"
#include "Components/BoxComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/SphereComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/Texture2D.h"
#include "EngineUtils.h"
#include "Factories/WorldFactory.h"
#include "IAssetTools.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "Misc/ConfigCacheIni.h"
#include "Misc/FileHelper.h"
#include "Misc/PackageName.h"
#include "PaperFlipbook.h"
#include "PaperFlipbookComponent.h"
#include "PaperSprite.h"
#include "PaperSpriteComponent.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"
#include "Sound/SoundBase.h"
#include "ToolMenus.h"
#include "UObject/SavePackage.h"

namespace ProtoMakeImport
{
    const FString Generated = TEXT("/Game/Generated/ProtoMake");
    TSharedPtr<FJsonObject> Project;
    TMap<FString, TSharedPtr<FJsonObject>> Assets;
    TMap<FString, UObject*> Imported;

    double Number(const TSharedPtr<FJsonObject>& Data, const TCHAR* Key, double Fallback = 0.0) { double Value = 0.0; return Data.IsValid() && Data->TryGetNumberField(Key, Value) ? Value : Fallback; }
    bool Boolean(const TSharedPtr<FJsonObject>& Data, const TCHAR* Key, bool Fallback = false) { bool Value = false; return Data.IsValid() && Data->TryGetBoolField(Key, Value) ? Value : Fallback; }
    FString String(const TSharedPtr<FJsonObject>& Data, const TCHAR* Key, const FString& Fallback = FString()) { FString Value; return Data.IsValid() && Data->TryGetStringField(Key, Value) ? Value : Fallback; }
    FString Safe(const FString& Source) { FString Result; for (TCHAR Character : Source) Result.AppendChar(FChar::IsAlnum(Character) || Character == '_' ? Character : '_'); return Result.IsEmpty() ? TEXT("ProtoMake") : Result; }
    FString Short(const FString& Id) { return Id.Replace(TEXT("-"), TEXT("")).Left(8); }
    FGuid Guid(const FString& Value) { FGuid Result; FGuid::Parse(Value, Result); return Result; }
    FString Json(const TSharedPtr<FJsonObject>& Value) { FString Result; const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Result); FJsonSerializer::Serialize(Value.ToSharedRef(), Writer); return Result; }
    FString Json(const TArray<TSharedPtr<FJsonValue>>& Value) { FString Result; const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Result); FJsonSerializer::Serialize(Value, Writer); return Result; }

    TSharedPtr<FJsonObject> Component(const TSharedPtr<FJsonObject>& Entity, const FString& Type)
    {
        const TArray<TSharedPtr<FJsonValue>>* Components = nullptr; if (!Entity->TryGetArrayField(TEXT("components"), Components)) return nullptr;
        for (const TSharedPtr<FJsonValue>& Item : *Components) { const TSharedPtr<FJsonObject>* Value = nullptr; if (Item->TryGetObject(Value) && (*Value)->GetStringField(TEXT("type")) == Type) return (*Value)->GetObjectField(TEXT("data")); }
        return nullptr;
    }

    void Save(UObject* Asset)
    {
        if (!Asset) return; UPackage* Package = Asset->GetOutermost(); FAssetRegistryModule::AssetCreated(Asset); Package->MarkPackageDirty();
        const FString Filename = FPackageName::LongPackageNameToFilename(Package->GetName(), FPackageName::GetAssetPackageExtension());
        FSavePackageArgs Args; Args.TopLevelFlags = RF_Public | RF_Standalone; Args.SaveFlags = SAVE_NoError; UPackage::SavePackage(Package, Asset, *Filename, Args);
    }

    UObject* NewAsset(UClass* Type, const FString& Folder, const FString& Name)
    {
        const FString PackageName = Generated + TEXT("/") + Folder + TEXT("/") + Name; UPackage* Package = CreatePackage(*PackageName);
        if (UObject* Existing = StaticFindObject(Type, Package, *Name)) return Existing;
        return NewObject<UObject>(Package, Type, *Name, RF_Public | RF_Standalone);
    }

    void ImportMedia()
    {
        IAssetTools& Tools = FModuleManager::LoadModuleChecked<FAssetToolsModule>(TEXT("AssetTools")).Get();
        for (const TPair<FString, TSharedPtr<FJsonObject>>& Pair : Assets)
        {
            const FString Kind = String(Pair.Value, TEXT("kind")); if (Kind != TEXT("image") && Kind != TEXT("audio")) continue;
            FString Mime = String(Pair.Value, TEXT("mime")); FString Extension = Mime == TEXT("image/png") ? TEXT(".png") : Mime == TEXT("image/jpeg") ? TEXT(".jpg") : Mime == TEXT("image/webp") ? TEXT(".webp") : Mime == TEXT("audio/wav") ? TEXT(".wav") : Mime == TEXT("audio/mpeg") ? TEXT(".mp3") : TEXT(".ogg");
            UAssetImportTask* Task = NewObject<UAssetImportTask>(); Task->Filename = FPaths::ProjectDir() / TEXT("ProtoMakeSource/Assets") / (Pair.Key + Extension); Task->DestinationPath = Generated + TEXT("/Assets"); Task->DestinationName = Pair.Key; Task->bAutomated = true; Task->bReplaceExisting = true; Task->bSave = true;
            TArray<UAssetImportTask*> Tasks{ Task }; Tools.ImportAssetTasks(Tasks); if (Task->ImportedObjectPaths.Num()) Imported.Add(Pair.Key, LoadObject<UObject>(nullptr, *Task->ImportedObjectPaths[0]));
        }
    }

    UPaperSprite* Sprite(const FString& Id)
    {
        if (UPaperSprite* Existing = Cast<UPaperSprite>(Imported.FindRef(TEXT("sprite:") + Id))) return Existing;
        TSharedPtr<FJsonObject>* Asset = Assets.Find(Id); if (!Asset) return nullptr;
        FString SourceId = Id;
        if (String(*Asset, TEXT("mime")) == TEXT("application/x-protomake-sprite-region")) { TSharedPtr<FJsonObject> Region; FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(String(*Asset, TEXT("data"))), Region); if (Region.IsValid()) SourceId = String(Region, TEXT("source")); }
        UTexture2D* Texture = Cast<UTexture2D>(Imported.FindRef(SourceId)); if (!Texture) return nullptr;
        const FString Name = TEXT("S_") + Safe(Id); UPaperSprite* Result = Cast<UPaperSprite>(NewAsset(UPaperSprite::StaticClass(), TEXT("Sprites"), Name)); Result->InitializeSprite(Texture); Save(Result); Imported.Add(TEXT("sprite:") + Id, Result); return Result;
    }

    UPaperFlipbook* Flipbook(const FString& Id)
    {
        if (UPaperFlipbook* Existing = Cast<UPaperFlipbook>(Imported.FindRef(TEXT("flipbook:") + Id))) return Existing;
        TSharedPtr<FJsonObject>* Asset = Assets.Find(Id); if (!Asset || String(*Asset, TEXT("mime")) != TEXT("application/x-protomake-animation")) return nullptr;
        TSharedPtr<FJsonObject> Source; if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(String(*Asset, TEXT("data"))), Source) || !Source.IsValid()) return nullptr;
        UPaperFlipbook* Result = Cast<UPaperFlipbook>(NewAsset(UPaperFlipbook::StaticClass(), TEXT("Animations"), TEXT("F_") + Safe(Id))); Result->SetFramesPerSecond(60.0f);
        const TArray<TSharedPtr<FJsonValue>>* Frames = nullptr; if (Source->TryGetArrayField(TEXT("frames"), Frames)) for (const TSharedPtr<FJsonValue>& Item : *Frames) { const TSharedPtr<FJsonObject>* Frame = nullptr; if (!Item->TryGetObject(Frame)) continue; const int32 Index = Result->AddKeyFrame(); FPaperFlipbookKeyFrame& Key = Result->GetKeyFrameChecked(Index); Key.Sprite = Sprite(String(*Frame, TEXT("texture"))); Key.FrameRun = FMath::Max(1, FMath::RoundToInt(Number(*Frame, TEXT("duration"), 1.0/12.0) * 60.0)); }
        Result->InvalidateCachedData(); Save(Result); Imported.Add(TEXT("flipbook:") + Id, Result); return Result;
    }

    void BuildInput()
    {
        UInputMappingContext* Context = Cast<UInputMappingContext>(NewAsset(UInputMappingContext::StaticClass(), TEXT("Input"), TEXT("ProtoMakeInput")));
        const TArray<TSharedPtr<FJsonValue>>* Definitions = nullptr; if (!Project->TryGetArrayField(TEXT("input"), Definitions)) return;
        for (const TSharedPtr<FJsonValue>& Item : *Definitions)
        {
            const TSharedPtr<FJsonObject>* Definition = nullptr; if (!Item->TryGetObject(Definition)) continue; const FString Name = String(*Definition, TEXT("name"));
            UInputAction* Action = Cast<UInputAction>(NewAsset(UInputAction::StaticClass(), TEXT("Input"), TEXT("IA_") + Safe(Name)));
            const FString Kind = String(*Definition, TEXT("kind")); Action->ValueType = Kind == TEXT("vector2") ? EInputActionValueType::Axis2D : Kind == TEXT("axis") ? EInputActionValueType::Axis1D : EInputActionValueType::Boolean; Save(Action);
            for (const FString Field : { TEXT("positiveX"), TEXT("negativeX"), TEXT("positiveY"), TEXT("negativeY") })
            {
                const TArray<TSharedPtr<FJsonValue>>* Bindings = nullptr; if (!(*Definition)->TryGetArrayField(Field, Bindings)) continue;
                for (const TSharedPtr<FJsonValue>& Binding : *Bindings) { FString Code; if (Binding->TryGetString(Code)) { const FKey Key(FName(*Code.Replace(TEXT("Key"), TEXT("")))); if (Key.IsValid()) Context->MapKey(Action, Key); } }
            }
        }
        Save(Context);
    }

    void AddComponents(AActor* Actor, const TSharedPtr<FJsonObject>& Entity)
    {
        const TArray<TSharedPtr<FJsonValue>>* Components = nullptr; if (!Entity->TryGetArrayField(TEXT("components"), Components)) return;
        const TSharedPtr<FJsonObject> Body = Component(Entity, TEXT("protomake.rigidbody"));
        for (const TSharedPtr<FJsonValue>& Item : *Components)
        {
            const TSharedPtr<FJsonObject>* Entry = nullptr; if (!Item->TryGetObject(Entry)) continue; const FString Type = (*Entry)->GetStringField(TEXT("type")); const TSharedPtr<FJsonObject> Data = (*Entry)->GetObjectField(TEXT("data"));
            if (Type == TEXT("protomake.sprite"))
            {
                UPaperSpriteComponent* Value = NewObject<UPaperSpriteComponent>(Actor); Actor->AddInstanceComponent(Value); Value->SetupAttachment(Actor->GetRootComponent()); Value->SetSprite(Sprite(String(Data, TEXT("texture")))); Value->SetRelativeLocation(FVector(0.0, Number(Data, TEXT("order")), 0.0)); Value->RegisterComponent();
            }
            else if (Type == TEXT("protomake.camera")) { UCameraComponent* Value = NewObject<UCameraComponent>(Actor); Actor->AddInstanceComponent(Value); Value->SetupAttachment(Actor->GetRootComponent()); Value->ProjectionMode = ECameraProjectionMode::Orthographic; Value->OrthoWidth = 1280.0 / FMath::Max(0.0001, Number(Data, TEXT("zoom"), 1.0)); Value->RegisterComponent(); }
            else if (Type == TEXT("protomake.audio-source")) { UAudioComponent* Value = NewObject<UAudioComponent>(Actor); Actor->AddInstanceComponent(Value); Value->SetupAttachment(Actor->GetRootComponent()); Value->SetSound(Cast<USoundBase>(Imported.FindRef(String(Data, TEXT("clip"))))); Value->bAutoActivate = Boolean(Data, TEXT("playOnAwake")); Value->SetVolumeMultiplier(Number(Data, TEXT("volume"), 1.0)); Value->SetPitchMultiplier(Number(Data, TEXT("rate"), 1.0)); Value->RegisterComponent(); }
            else if (Type == TEXT("protomake.animator"))
            {
                TSharedPtr<FJsonObject>* ControllerAsset = Assets.Find(String(Data, TEXT("controller"))); if (!ControllerAsset) continue; TSharedPtr<FJsonObject> Controller; if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(String(*ControllerAsset, TEXT("data"))), Controller) || !Controller.IsValid()) continue; const FString Initial = String(Controller, TEXT("initial")); FString Clip;
                const TArray<TSharedPtr<FJsonValue>>* States = nullptr; if (Controller->TryGetArrayField(TEXT("states"), States)) for (const TSharedPtr<FJsonValue>& StateItem : *States) { const TSharedPtr<FJsonObject>* State = nullptr; if (StateItem->TryGetObject(State) && String(*State, TEXT("name")) == Initial) { Clip = String(*State, TEXT("clip")); break; } }
                UPaperFlipbookComponent* Value = NewObject<UPaperFlipbookComponent>(Actor); Actor->AddInstanceComponent(Value); Value->SetupAttachment(Actor->GetRootComponent()); Value->SetFlipbook(Flipbook(Clip)); Value->SetPlayRate(Number(Data, TEXT("speed"), 1.0)); Value->RegisterComponent();
            }
            else if (Type == TEXT("protomake.box-collider")) { UBoxComponent* Value = NewObject<UBoxComponent>(Actor); Actor->AddInstanceComponent(Value); Value->SetupAttachment(Actor->GetRootComponent()); Value->SetBoxExtent(FVector(Number(Data, TEXT("width"), 64.0) * .5, 8.0, Number(Data, TEXT("height"), 64.0) * .5)); Value->SetCollisionProfileName(Boolean(Data, TEXT("sensor")) ? TEXT("Trigger") : TEXT("BlockAllDynamic")); Value->SetSimulatePhysics(String(Body, TEXT("mode")) == TEXT("dynamic")); Value->RegisterComponent(); }
            else if (Type == TEXT("protomake.circle-collider")) { USphereComponent* Value = NewObject<USphereComponent>(Actor); Actor->AddInstanceComponent(Value); Value->SetupAttachment(Actor->GetRootComponent()); Value->SetSphereRadius(Number(Data, TEXT("radius"), 32.0)); Value->SetCollisionProfileName(Boolean(Data, TEXT("sensor")) ? TEXT("Trigger") : TEXT("BlockAllDynamic")); Value->SetSimulatePhysics(String(Body, TEXT("mode")) == TEXT("dynamic")); Value->RegisterComponent(); }
            else if (Type == TEXT("protomake.capsule-collider")) { UCapsuleComponent* Value = NewObject<UCapsuleComponent>(Actor); Actor->AddInstanceComponent(Value); Value->SetupAttachment(Actor->GetRootComponent()); Value->SetCapsuleSize(Number(Data, TEXT("radius"), 16.0), Number(Data, TEXT("halfHeight"), 16.0) + Number(Data, TEXT("radius"), 16.0)); Value->SetCollisionProfileName(Boolean(Data, TEXT("sensor")) ? TEXT("Trigger") : TEXT("BlockAllDynamic")); Value->SetSimulatePhysics(String(Body, TEXT("mode")) == TEXT("dynamic")); Value->RegisterComponent(); }
            else if (Type == TEXT("protomake.behaviours"))
            {
                const TArray<TSharedPtr<FJsonValue>>* Order = nullptr; const TSharedPtr<FJsonObject>* Items = nullptr; if (!Data->TryGetArrayField(TEXT("order"), Order) || !Data->TryGetObjectField(TEXT("items"), Items)) continue;
                for (const TSharedPtr<FJsonValue>& OrderItem : *Order) { FString Key; if (!OrderItem->TryGetString(Key)) continue; const TSharedPtr<FJsonObject>* Behaviour = nullptr; if (!(*Items)->TryGetObjectField(Key, Behaviour) || String(*Behaviour, TEXT("kind")) != TEXT("graph")) continue; UProtoMakeGraphComponent* Value = NewObject<UProtoMakeGraphComponent>(Actor); Actor->AddInstanceComponent(Value); Value->ProtoMakeEntityId = Guid(String(Entity, TEXT("id"))); Value->GraphFile = FPaths::ProjectDir() / TEXT("ProtoMakeSource/Data/graphs") / (String(*Behaviour, TEXT("graph")) + TEXT(".json")); Value->OverridesJson = Json((*Behaviour)->GetObjectField(TEXT("values"))); Value->RegisterComponent(); }
            }
        }
    }

    void BuildScene(const TSharedPtr<FJsonObject>& Source)
    {
        const FString AssetName = Safe(String(Source, TEXT("name"))) + TEXT("_") + Short(String(Source, TEXT("id"))); const FString PackageName = Generated + TEXT("/Maps/") + AssetName; UPackage* Package = CreatePackage(*PackageName); UWorld* World = FindObject<UWorld>(Package, *AssetName);
        if (!World) { UWorldFactory* Factory = NewObject<UWorldFactory>(); World = Cast<UWorld>(Factory->FactoryCreateNew(UWorld::StaticClass(), Package, *AssetName, RF_Public | RF_Standalone, nullptr, GWarn)); }
        if (!World) return; TArray<AActor*> Previous; for (TActorIterator<AActor> It(World); It; ++It) if (!It->IsA<AWorldSettings>()) Previous.Add(*It); for (AActor* Actor : Previous) World->DestroyActor(Actor); TMap<FString, AActor*> Actors;
        const TArray<TSharedPtr<FJsonValue>>* Entities = nullptr; if (!Source->TryGetArrayField(TEXT("entities"), Entities)) return;
        for (const TSharedPtr<FJsonValue>& Item : *Entities)
        {
            const TSharedPtr<FJsonObject>* Entity = nullptr; if (!Item->TryGetObject(Entity)) continue; AActor* Actor = World->SpawnActor<AActor>(); Actor->SetActorLabel(String(*Entity, TEXT("name"))); USceneComponent* Root = NewObject<USceneComponent>(Actor); Actor->SetRootComponent(Root); Actor->AddInstanceComponent(Root); Root->RegisterComponent();
            UProtoMakeIdentityComponent* Identity = NewObject<UProtoMakeIdentityComponent>(Actor); Actor->AddInstanceComponent(Identity); Identity->ProtoMakeId = Guid(String(*Entity, TEXT("id"))); Identity->ComponentJson = Json((*Entity)->GetArrayField(TEXT("components"))); const TSharedPtr<FJsonObject> Tags = Component(*Entity, TEXT("protomake.tags")); const TArray<TSharedPtr<FJsonValue>>* TagValues = nullptr; if (Tags.IsValid() && Tags->TryGetArrayField(TEXT("tags"), TagValues)) for (const TSharedPtr<FJsonValue>& TagValue : *TagValues) { FString Tag; if (TagValue->TryGetString(Tag)) { Identity->ProtoMakeTags.Add(FName(*Tag)); Actor->Tags.Add(FName(*Tag)); } } Identity->RegisterComponent(); Actors.Add(String(*Entity, TEXT("id")), Actor);
        }
        for (const TSharedPtr<FJsonValue>& Item : *Entities)
        {
            const TSharedPtr<FJsonObject>* Entity = nullptr; Item->TryGetObject(Entity); AActor* Actor = Actors[String(*Entity, TEXT("id"))]; const FString Parent = String(*Entity, TEXT("parent")); if (!Parent.IsEmpty() && Actors.Contains(Parent)) Actor->AttachToActor(Actors[Parent], FAttachmentTransformRules::KeepRelativeTransform);
            const TArray<TSharedPtr<FJsonValue>>& Matrix = (*Entity)->GetArrayField(TEXT("transform")); const double A = Matrix[0]->AsNumber(), B = Matrix[1]->AsNumber(), C = Matrix[2]->AsNumber(), D = Matrix[3]->AsNumber(); const double ScaleX = FMath::Sqrt(A*A+B*B); const double ScaleY = ScaleX < UE_SMALL_NUMBER ? FMath::Sqrt(C*C+D*D) : (A*D-B*C)/ScaleX; const double Rotation = ScaleX < UE_SMALL_NUMBER ? FMath::Atan2(-C,D) : FMath::Atan2(B,A);
            Actor->SetActorRelativeLocation(ProtoMakeCoordinates::Position(Matrix[4]->AsNumber(), Matrix[5]->AsNumber())); Actor->SetActorRelativeRotation(FRotator(ProtoMakeCoordinates::Degrees(Rotation), 0.0, 0.0)); Actor->SetActorRelativeScale3D(FVector(ScaleX, 1.0, ScaleY)); Actor->SetActorHiddenInGame(!Boolean(*Entity, TEXT("enabled"), true)); Actor->SetActorEnableCollision(Boolean(*Entity, TEXT("enabled"), true)); AddComponents(Actor, *Entity);
        }
        Save(World);
    }

    bool Run()
    {
        FString Source; const FString Path = FPaths::ProjectDir() / TEXT("ProtoMakeSource/Data/protomake-ir.json"); if (!FFileHelper::LoadFileToString(Source, *Path)) return false;
        if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Source), Project) || !Project.IsValid()) return false; Assets.Empty(); Imported.Empty();
        const TArray<TSharedPtr<FJsonValue>>* AssetValues = nullptr; if (Project->TryGetArrayField(TEXT("assets"), AssetValues)) for (const TSharedPtr<FJsonValue>& Item : *AssetValues) { const TSharedPtr<FJsonObject>* Asset = nullptr; if (Item->TryGetObject(Asset)) Assets.Add(String(*Asset, TEXT("id")), *Asset); }
        ImportMedia(); BuildInput(); const TArray<TSharedPtr<FJsonValue>>* Scenes = nullptr; if (Project->TryGetArrayField(TEXT("scenes"), Scenes)) for (const TSharedPtr<FJsonValue>& Item : *Scenes) { const TSharedPtr<FJsonObject>* Scene = nullptr; if (Item->TryGetObject(Scene)) BuildScene(*Scene); } return true;
    }
}

void FProtoMakeImporterModule::StartupModule() { UToolMenus::RegisterStartupCallback(FSimpleMulticastDelegate::FDelegate::CreateRaw(this, &FProtoMakeImporterModule::RegisterMenus)); ImportIfChanged(); }
void FProtoMakeImporterModule::ShutdownModule() { if (UToolMenus::IsToolMenuUIEnabled()) UToolMenus::UnRegisterStartupCallback(this); }
void FProtoMakeImporterModule::RegisterMenus() { FToolMenuOwnerScoped Owner(this); UToolMenu* Menu = UToolMenus::Get()->ExtendMenu(TEXT("LevelEditor.MainMenu.Tools")); FToolMenuSection& Section = Menu->FindOrAddSection(TEXT("ProtoMake")); Section.AddMenuEntry(TEXT("ProtoMakeReimport"), FText::FromString(TEXT("ProtoMake Reimport")), FText::FromString(TEXT("Rebuild generated content from ProtoMake Interchange IR")), FSlateIcon(), FUIAction(FExecuteAction::CreateRaw(this, &FProtoMakeImporterModule::Import))); }
void FProtoMakeImporterModule::ImportIfChanged() { FString Source; if (!FFileHelper::LoadFileToString(Source, *(FPaths::ProjectDir() / TEXT("ProtoMakeSource/Data/export-manifest.json")))) return; TSharedPtr<FJsonObject> Manifest; if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Source), Manifest)) return; const FString Hash = ProtoMakeImport::String(Manifest, TEXT("sourceHash")); FString Previous; GConfig->GetString(TEXT("ProtoMakeImport"), TEXT("SourceHash"), Previous, GEditorPerProjectIni); if (Hash != Previous) Import(); }
void FProtoMakeImporterModule::Import() { if (ProtoMakeImport::Run()) { FString Source; FFileHelper::LoadFileToString(Source, *(FPaths::ProjectDir() / TEXT("ProtoMakeSource/Data/export-manifest.json"))); TSharedPtr<FJsonObject> Manifest; FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Source), Manifest); GConfig->SetString(TEXT("ProtoMakeImport"), TEXT("SourceHash"), *ProtoMakeImport::String(Manifest, TEXT("sourceHash")), GEditorPerProjectIni); GConfig->Flush(false, GEditorPerProjectIni); UE_LOG(LogTemp, Display, TEXT("ProtoMake import complete. Review ProtoMakeSource/Data/portability-report.json")); } }

IMPLEMENT_MODULE(FProtoMakeImporterModule, ProtoMakeImporter)
`;
