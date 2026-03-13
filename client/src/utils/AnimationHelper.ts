import { AnimationGroup, Scene, Skeleton } from "@babylonjs/core";

export class AnimationHelper {
    public static CreateInPlace(source: AnimationGroup, skeleton: Skeleton, scene: Scene, name: string): AnimationGroup {
        const group = new AnimationGroup(name, scene);
        
        source.targetedAnimations.forEach((ta: any) => {
            if (!ta.target?.name) return;

            const bone = skeleton.bones.find((b) => b.name === ta.target.name);
            if (!bone) return;

            const tNode = bone.getTransformNode();
            if (!tNode) return;

            // JURUS ANTI-RESET: Abaikan animasi posisi pada root/hips jika ada
            if (ta.animation.targetProperty === "position") return;

            group.addTargetedAnimation(ta.animation, tNode);
        });

        return group;
    }
}