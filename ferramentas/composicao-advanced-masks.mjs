// SDK keys/enums: obs-advanced-masks 1.5.4 mask-shape.{c,h}. No arbitrary plugin settings.
export const advancedMaskKind='advanced_masks_filter_v2';
export const advancedMaskFilter='3Mix Slot Advanced Mask';
const shapes=['circle','rectangle','ellipse','polygon','star','heart'];
export function normalizeAdvancedMask(value){
 if(!value||value.type!=='advanced'||!shapes.includes(value.shape))throw Error('Advanced Masks: forma inválida');
 const number=(key,fallback,min,max,integer=false)=>{const n=Number(value[key]??fallback);if(!Number.isFinite(n)||n<min||n>max||integer&&!Number.isInteger(n))throw Error('Advanced Masks: '+key+' fora do intervalo');return n;};
 return {type:'advanced',shape:value.shape,size:number('size',.9,.1,1),feather:number('feather',0,0,.15),featherMode:['inner','middle','outer'].includes(value.featherMode)?value.featherMode:'inner',sides:number('sides',6,3,12,true),points:number('points',5,3,12,true),inner:number('inner',50,5,95),corner:number('corner',0,0,.4)};
}
export function advancedMaskSettings(value,video,rect){
 const m=normalizeAdvancedMask(value),W=video.baseWidth,H=video.baseHeight,sw=W*rect[2],sh=H*rect[3],D=Math.min(W,H),radius=D*m.size/2;
 // The private slot scene shares the OBS canvas. Ellipse axes compensate its outer stretch,
 // so Circle remains round in the final slot rather than inheriting the canvas aspect.
 const diameter=Math.min(sw,sh)*m.size;
 const shape={rectangle:1,circle:3,ellipse:3,polygon:4,star:5,heart:6}[m.shape];
 return {mask_effect:1,mask_type:1,shape_type:shape,shape_relative:false,shape_invert:false,shape_frame_check:false,shape_center_x:W/2,shape_center_y:H/2,position_x:W/2,position_y:H/2,position_scale:100,source_zoom:100,scale_type:1,shape_rotation:0,rectangle_width:W*m.size,rectangle_height:H*m.size,rectangle_corner_type:1,rectangle_corner_radius:D*m.corner,shape_ellipse_a:m.shape==='circle'?diameter/rect[2]:W*m.size,shape_ellipse_b:m.shape==='circle'?diameter/rect[3]:H*m.size,circle_radius:radius,shape_num_sides:m.sides,shape_corner_radius:0,shape_star_num_points:m.points,shape_star_outer_radius:radius,shape_star_inner_radius:m.inner,star_corner_radius:0,heart_size:D*m.size,shape_feather_type:m.feather?({inner:2,middle:3,outer:4}[m.featherMode]):1,shape_feather_amount:D*m.feather};
}
