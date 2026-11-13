/* Deterministic geographic callout placement. No DOM, timers, randomness, or dependencies.
 * Copyright 2026 Tokyo City Atlas contributors. MIT license.
 * Browser: layoutRegionLabels(items, frame, options). CommonJS: require(file).
 */
(function (root, factory) {
  'use strict';
  var layout = factory();
  if (typeof module === 'object' && module.exports) module.exports = layout;
  else root.layoutRegionLabels = layout;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var EPS = 0.00001;
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function finite(x) { return typeof x === 'number' && Number.isFinite(x); }
  function compareId(a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; }
  function rect(x, y, w, h) { return { left:x-w/2, right:x+w/2, top:y-h/2, bottom:y+h/2 }; }
  function collision(a, b, gap) {
    return a.left < b.right+gap-EPS && a.right > b.left-gap+EPS && a.top < b.bottom+gap-EPS && a.bottom > b.top-gap+EPS;
  }
  function inside(r, f) { return r.left >= f.left-EPS && r.right <= f.right+EPS && r.top >= f.top-EPS && r.bottom <= f.bottom+EPS; }
  function cleanFrame(f) {
    if (!f || !['left','right','top','bottom'].every(function (k) { return finite(f[k]); })) throw new TypeError('A finite frame rectangle is required.');
    if (f.right < f.left || f.bottom < f.top) throw new RangeError('Frame edges must be ordered.');
    return { left:f.left, right:f.right, top:f.top, bottom:f.bottom };
  }
  function previousMap(value) {
    var out = new Map();
    if (value instanceof Map) value.forEach(function (p, id) { out.set(String(id), p); });
    else if (Array.isArray(value)) value.forEach(function (p) { if (p) out.set(String(p.id), p); });
    else if (value && Array.isArray(value.items)) return previousMap(value.items);
    else if (value && typeof value === 'object') Object.keys(value).forEach(function (id) { out.set(id, value[id]); });
    return out;
  }
  // Projection onto an ordered, bounded line. Subtract packed prefix offsets,
  // then pool adjacent violators; labels cannot overlap or change row order.
  function isotonic(targets, weights, low, high) {
    var blocks = [], answer = new Array(targets.length);
    targets.forEach(function (value, i) {
      blocks.push({ first:i, last:i, sum:value*weights[i], weight:weights[i] });
      while (blocks.length > 1) {
        var a = blocks[blocks.length-2], b = blocks[blocks.length-1];
        if (a.sum/a.weight <= b.sum/b.weight+EPS) break;
        a.last=b.last; a.sum+=b.sum; a.weight+=b.weight; blocks.pop();
      }
    });
    blocks.forEach(function (b) { var value=clamp(b.sum/b.weight,low,high); for(var i=b.first;i<=b.last;i++) answer[i]=value; });
    return answer;
  }
  function sequenceCenters(items, start, end, gap, dimension, preferred) {
    var offsets=[], total=0, weights=[], targets=[];
    items.forEach(function (item,i) {
      var size=item[dimension]; offsets.push(total+size/2); total+=size+(i<items.length-1?gap:0);
      targets.push(preferred(item)-offsets[i]); weights.push(1);
    });
    if(total>end-start+EPS) return null;
    var shifts=isotonic(targets,weights,start,end-total);
    return offsets.map(function (offset,i) { return offset+shifts[i]; });
  }
  // Exact minimum-height row breaks for one deterministic item order.
  // This is O(n^2), rather than a greedy shelf rule that wastes short viewports.
  function partition(order, width, gap) {
    var n=order.length, cost=new Array(n+1).fill(Infinity), previous=new Array(n+1), count=new Array(n+1).fill(0);
    cost[0]=0;
    for(var end=1;end<=n;end++) {
      var sum=0, height=0;
      for(var start=end-1;start>=0;start--) {
        sum+=order[start].width+(start<end-1?gap:0); height=Math.max(height,order[start].height);
        if(sum>width+EPS) break;
        var value=cost[start]+height+(start?gap:0), rows=count[start]+1;
        if(value<cost[end]-EPS || (Math.abs(value-cost[end])<=EPS && (rows<count[end] || (rows===count[end] && start<previous[end])))) {
          cost[end]=value; previous[end]=start; count[end]=rows;
        }
      }
    }
    if(!finite(cost[n])) return null;
    var result=[];
    for(var cursor=n;cursor>0;) {
      var begin=previous[cursor], members=order.slice(begin,cursor);
      members.sort(function (a,b) { return a.x-b.x || a.y-b.y || compareId(a,b); });
      result.unshift({ items:members, height:Math.max.apply(null,members.map(function (a) { return a.height; })) }); cursor=begin;
    }
    return { rows:result, height:cost[n] };
  }
  // Capacity-oriented companion to the ordered DP: let a short label share
  // spare shelf space with a long one even when their anchor ranks differ.
  // Rows and their members are sorted geographically again before placement.
  function binPlan(order, width, gap) {
    var rows=[];
    for(var i=0;i<order.length;i++) {
      var item=order[i],chosen=null,best=Infinity;
      if(item.width>width+EPS) return null;
      rows.forEach(function (row) {
        var used=row.width+gap+item.width;if(used>width+EPS)return;
        var value=(Math.max(row.height,item.height)-row.height)*width+(width-used);
        if(value<best-EPS){chosen=row;best=value;}
      });
      if(chosen){chosen.items.push(item);chosen.width+=gap+item.width;chosen.height=Math.max(chosen.height,item.height);}
      else rows.push({items:[item],width:item.width,height:item.height});
    }
    rows.forEach(function (row) {
      row.items.sort(function (a,b) { return a.x-b.x || a.y-b.y || compareId(a,b); });
      row.anchorY=row.items.reduce(function (sum,a) { return sum+a.y; },0)/row.items.length;
    });
    rows.sort(function (a,b) { return a.anchorY-b.anchorY || compareId(a.items[0],b.items[0]); });
    return {rows:rows,height:rows.reduce(function (sum,row) { return sum+row.height; },0)+gap*Math.max(0,rows.length-1)};
  }
  function freeIntervals(f, band, obstacles, gap) {
    var blocked=obstacles.filter(function (o) { return band.top<o.bottom+gap-EPS && band.bottom>o.top-gap+EPS; })
      .map(function (o) { return {left:Math.max(f.left,o.left-gap),right:Math.min(f.right,o.right+gap)}; })
      .sort(function (a,b) { return a.left-b.left || a.right-b.right; });
    var intervals=[], cursor=f.left;
    blocked.forEach(function (b) { if(b.left>cursor+EPS) intervals.push({left:cursor,right:b.left}); cursor=Math.max(cursor,b.right); });
    if(cursor<f.right-EPS) intervals.push({left:cursor,right:f.right});
    return intervals;
  }
  function rowInIntervals(row, y, intervals, gap) {
    var members=row.items, n=members.length;
    var dp=new Array(intervals.length+1).fill(null).map(function () { return new Array(n+1).fill(null); });
    dp[0][0]={cost:0,placements:[]};
    for(var s=0;s<intervals.length;s++) {
      for(var count=0;count<=n;count++) {
        if(!dp[s][count]) continue;
        for(var end=count;end<=n;end++) {
          var subset=members.slice(count,end), xs=sequenceCenters(subset,intervals[s].left,intervals[s].right,gap,'width',function (a) { return a.targetX; });
          if(!xs) break;
          var additions=subset.map(function (a,i) {
            var cy=clamp(a.targetY,y-row.height/2+a.height/2,y+row.height/2-a.height/2);
            return {item:a,x:xs[i],y:cy,rect:rect(xs[i],cy,a.width,a.height)};
          });
          var score=dp[s][count].cost+additions.reduce(function (sum,p) { return sum+pointCost(p.item,p.x,p.y); },0);
          if(!dp[s+1][end] || score<dp[s+1][end].cost-EPS) dp[s+1][end]={cost:score,placements:dp[s][count].placements.concat(additions)};
        }
      }
    }
    return dp[intervals.length][n] && dp[intervals.length][n].placements;
  }
  function pointCost(item,x,y) {
    var dx=x-item.x,dy=y-item.y, score=dx*dx+dy*dy;
    if(item.prior) { dx=x-item.prior.x;dy=y-item.prior.y;score+=(dx*dx+dy*dy); }
    return score;
  }
  function valid(placements,f,obstacles,gap) {
    for(var i=0;i<placements.length;i++) {
      if(!inside(placements[i].rect,f) || obstacles.some(function (o) { return collision(placements[i].rect,o,gap); })) return false;
      for(var j=0;j<i;j++) if(collision(placements[i].rect,placements[j].rect,gap)) return false;
    }
    return true;
  }
  function cost(placements) {
    var value=placements.reduce(function (sum,p) { return sum+pointCost(p.item,p.x,p.y); },0);
    // Softly prefer the same west/east and north/south reading order as anchors.
    for(var i=0;i<placements.length;i++) for(var j=0;j<i;j++) {
      var a=placements[i],b=placements[j], dx=a.item.x-b.item.x,dy=a.item.y-b.item.y;
      if(Math.abs(dx)>20 && dx*(a.x-b.x)<0) value+=Math.min(4000,Math.abs(dx*(a.x-b.x))*.18);
      if(Math.abs(dy)>20 && dy*(a.y-b.y)<0) value+=Math.min(4000,Math.abs(dy*(a.y-b.y))*.18);
    }
    return value;
  }
  function greedy(order,f,obstacles,gap) {
    var placed=[];
    for(var i=0;i<order.length;i++) {
      var item=order[i], halfW=item.width/2,halfH=item.height/2;
      if(item.width>f.right-f.left+EPS || item.height>f.bottom-f.top+EPS) return null;
      var minX=f.left+halfW,maxX=f.right-halfW,minY=f.top+halfH,maxY=f.bottom-halfH;
      var targetX=clamp(item.targetX,minX,maxX), targetY=clamp(item.targetY,minY,maxY), candidates=[[targetX,targetY],[minX,targetY],[maxX,targetY],[targetX,minY],[targetX,maxY],[minX,minY],[maxX,minY],[minX,maxY],[maxX,maxY]];
      if(item.prior) candidates.unshift([clamp(item.prior.x,minX,maxX),clamp(item.prior.y,minY,maxY)]);
      var blockers=obstacles.concat(placed.map(function (p) { return p.rect; }));
      blockers.forEach(function (b) {
        var l=b.left-halfW-gap,r=b.right+halfW+gap,t=b.top-halfH-gap,d=b.bottom+halfH+gap;
        candidates.push([l,targetY],[r,targetY],[targetX,t],[targetX,d],[l,t],[l,d],[r,t],[r,d]);
        candidates.push([b.left+halfW,t],[b.right-halfW,t],[b.left+halfW,d],[b.right-halfW,d],[l,b.top+halfH],[l,b.bottom-halfH],[r,b.top+halfH],[r,b.bottom-halfH]);
      });
      var best=null,bestCost=Infinity;
      for(var c=0;c<candidates.length;c++) {
        var x=candidates[c][0],y=candidates[c][1];
        if(x<minX-EPS || x>maxX+EPS || y<minY-EPS || y>maxY+EPS) continue;
        var value=pointCost(item,x,y); if(value>=bestCost-EPS) continue;
        var box=rect(x,y,item.width,item.height);
        if(blockers.some(function (b) { return collision(box,b,gap); })) continue;
        best={item:item,x:x,y:y,rect:box};bestCost=value;
      }
      if(!best) return null;
      placed.push(best);
    }
    return placed;
  }
  function shelfCandidates(plan,f,obstacles,gap,accept) {
    if(!plan || plan.height>f.bottom-f.top+EPS) return;
    var offsets=[],targets=[],weights=[],cursor=0,rows=plan.rows;
    rows.forEach(function (row,i) {
      offsets.push(cursor+row.height/2);cursor+=row.height+(i<rows.length-1?gap:0);
      targets.push(row.items.reduce(function (s,a) { return s+a.targetY; },0)/row.items.length-offsets[i]);weights.push(row.items.length);
    });
    var origins=isotonic(targets,weights,f.top,f.bottom-plan.height), profiles=[origins];
    var bases=[f.top,f.bottom-plan.height,clamp(targets.reduce(function (a,b) { return a+b; },0)/targets.length,f.top,f.bottom-plan.height)];
    obstacles.forEach(function (o) { rows.forEach(function (row,i) {
      bases.push(clamp(o.top-gap-row.height/2-offsets[i],f.top,f.bottom-plan.height));
      bases.push(clamp(o.bottom+gap+row.height/2-offsets[i],f.top,f.bottom-plan.height));
    }); });
    bases.filter(function (base,i,array) { return array.findIndex(function (b) { return Math.abs(b-base)<.1; })===i; })
      .forEach(function (base) { profiles.push(rows.map(function () { return base; })); });
    for(var p=0;p<profiles.length;p++) {
      var all=[],failed=false;
      for(var r=0;r<rows.length;r++) {
        var y=offsets[r]+profiles[p][r], band={top:y-rows[r].height/2,bottom:y+rows[r].height/2};
        var members=rowInIntervals(rows[r],y,freeIntervals(f,band,obstacles,gap),gap);
        if(!members) { failed=true;break; } all=all.concat(members);
      }
      if(!failed) accept(all,'packed');
    }
  }
  // Last bounded capacity pass for narrow phones beside tall map controls.
  // Unlike an ordered shelf, each horizontal band can have a different usable
  // width. Best-fit assignment fills those unequal slots before anchoring them.
  function bandCandidates(items,f,obstacles,gap,accept) {
    var minH=Math.min.apply(null,items.map(function (a) { return a.height; }));
    var maxH=Math.max.apply(null,items.map(function (a) { return a.height; }));
    var tall=items.filter(function (a) { return a.height>minH+EPS; });
    var widths=items.reduce(function (s,a) { return s+a.width; },0), W=f.right-f.left,H=f.bottom-f.top;
    var leastRows=Math.max(1,Math.ceil(widths/(W+gap))), mostRows=Math.min(items.length,Math.floor((H+gap)/(minH+gap)));
    var tallPlan=tall.length?binPlan(tall.slice().sort(function (a,b) { return b.width-a.width || compareId(a,b); }),W,gap):null;
    var leastTall=tallPlan?tallPlan.rows.length:0;
    var orders=[items.slice().sort(function (a,b) { return b.height-a.height || b.width-a.width || compareId(a,b); }),items.slice().sort(function (a,b) { return b.width-a.width || b.height-a.height || compareId(a,b); })];
    for(var count=leastRows;count<=mostRows;count++) for(var tallCount=leastTall;tallCount<=Math.min(tall.length,count);tallCount++) {
      var total=count*minH+tallCount*(maxH-minH)+(count-1)*gap;if(total>H+EPS)continue;
      var bases=[f.top,f.bottom-total,(f.top+f.bottom-total)/2];
      var rotations=tallCount && tallCount<count?count:1;
      for(var rotation=0;rotation<rotations;rotation++) for(var b=0;b<bases.length;b++) {
        var slots=[],y=bases[b];
        for(var row=0;row<count;row++) {
          var height=(row+rotation)%count<tallCount?maxH:minH,cy=y+height/2;
          freeIntervals(f,{top:y,bottom:y+height},obstacles,gap).forEach(function (interval) { slots.push({left:interval.left,right:interval.right,y:cy,height:height}); });
          y+=height+gap;
        }
        for(var orderIndex=0;orderIndex<orders.length;orderIndex++) {
          var bins=slots.map(function (slot) { return {slot:slot,items:[],used:0}; }),failed=false;
          for(var i=0;i<orders[orderIndex].length;i++) {
            var item=orders[orderIndex][i],winner=null,best=Infinity;
            bins.forEach(function (bin) {
              var added=item.width+(bin.items.length?gap:0),available=bin.slot.right-bin.slot.left-bin.used;
              if(item.height>bin.slot.height+EPS || added>available+EPS)return;
              var score=available-added+Math.abs(bin.slot.y-item.targetY)*.0001;
              if(score<best-EPS){best=score;winner=bin;}
            });
            if(!winner){failed=true;break;}winner.used+=item.width+(winner.items.length?gap:0);winner.items.push(item);
          }
          if(failed)continue;
          var placements=[];
          bins.forEach(function (bin) {
            bin.items.sort(function (a,b) { return a.x-b.x || a.y-b.y || compareId(a,b); });
            var xs=sequenceCenters(bin.items,bin.slot.left,bin.slot.right,gap,'width',function (a) { return a.targetX; });
            bin.items.forEach(function (a,i) { var cy=clamp(a.targetY,bin.slot.y-bin.slot.height/2+a.height/2,bin.slot.y+bin.slot.height/2-a.height/2);placements.push({item:a,x:xs[i],y:cy,rect:rect(xs[i],cy,a.width,a.height)}); });
          });
          accept(placements,'packed');
        }
      }
    }
  }
  function leader(p) {
    var dx=p.x-p.item.x,dy=p.y-p.item.y;
    if(Math.abs(dx)<=p.item.width/2 && Math.abs(dy)<=p.item.height/2) return null;
    var factor=Math.min(dx ? p.item.width/2/Math.abs(dx) : Infinity,dy ? p.item.height/2/Math.abs(dy) : Infinity);
    return {from:{x:p.item.x,y:p.item.y},to:{x:p.x-dx*factor,y:p.y-dy*factor}};
  }
  function result(items,placements,frame,mode,fits,reason,contentFrame,gap,obstacles,preserveReference) {
    var lookup=new Map(placements.map(function (p) { return [p.item.key,p]; })),total=0,max=0;
    var output=items.map(function (item) {
      var p=lookup.get(item.key),distance=Math.hypot(p.x-item.x,p.y-item.y);total+=distance;max=Math.max(max,distance);
      return {id:item.id,anchorX:item.x,anchorY:item.y,layoutAnchorX:preserveReference?item.referenceX:item.x,layoutAnchorY:preserveReference?item.referenceY:item.y,x:p.x,y:p.y,width:item.width,height:item.height,rect:p.rect,dx:p.x-item.x,dy:p.y-item.y,displaced:distance>.5,leader:fits?leader(p):null};
    });
    return {items:output,mode:mode,fits:fits,reason:reason||null,frame:frame,contentFrame:contentFrame,
      contentWidth:contentFrame.right-contentFrame.left,contentHeight:contentFrame.bottom-contentFrame.top,
      needsScroll:!fits,compactRecommended:!fits && items.some(function (a) { return a.height>30; }),
      stats:{count:items.length,gap:gap,obstacleCount:obstacles.length,maxDisplacement:max,meanDisplacement:items.length?total/items.length:0}};
  }
  function reading(items,f,gap,obstacles,reason) {
    var width=Math.max(1,f.right-f.left,Math.max.apply(null,items.map(function (a) { return a.width; })));
    var order=items.slice().sort(function (a,b) { return a.y-b.y || a.x-b.x || compareId(a,b); });
    var plan=partition(order,width,gap),placements=[],y=f.top;
    plan.rows.forEach(function (row) {
      var total=row.items.reduce(function (s,a) { return s+a.width; },0)+gap*(row.items.length-1),x=f.left+(width-total)/2;
      row.items.forEach(function (a) { placements.push({item:a,x:x+a.width/2,y:y+row.height/2,rect:rect(x+a.width/2,y+row.height/2,a.width,a.height)});x+=a.width+gap; });
      y+=row.height+gap;
    });
    var virtual={left:f.left,right:f.left+width,top:f.top,bottom:f.top+plan.height};
    return result(items,placements,f,'reading',false,reason,virtual,gap,obstacles);
  }
  return function layoutRegionLabels(input,frame,options) {
    options=options||{};var f=cleanFrame(frame),gap=finite(options.gap)?Math.max(0,options.gap):4,previous=previousMap(options.previous),keys=new Set();
    if(!Array.isArray(input)) throw new TypeError('Label items must be an array.');
    var items=input.map(function (source) {
      if(!source || source.id==null || !['x','y','width','height'].every(function (key) { return finite(source[key]); }) || source.width<=0 || source.height<=0) throw new TypeError('Every label needs a unique id, finite anchor, and positive measured dimensions.');
      var key=String(source.id);if(keys.has(key)) throw new TypeError('Duplicate label id: '+key);keys.add(key);
      var prior=source.previous||previous.get(key),projected=null;
      if(prior && finite(prior.x) && finite(prior.y)) projected={x:prior.x+(finite(prior.anchorX)?source.x-prior.anchorX:0),y:prior.y+(finite(prior.anchorY)?source.y-prior.anchorY:0)};
      return {id:source.id,key:key,x:source.x,y:source.y,width:source.width,height:source.height,prior:projected,held:projected?{x:prior.x,y:prior.y}:null,
        referenceX:prior&&finite(prior.layoutAnchorX)?prior.layoutAnchorX:prior&&finite(prior.anchorX)?prior.anchorX:source.x,
        referenceY:prior&&finite(prior.layoutAnchorY)?prior.layoutAnchorY:prior&&finite(prior.anchorY)?prior.anchorY:source.y,
        targetX:projected?(source.x+projected.x)/2:source.x,targetY:projected?(source.y+projected.y)/2:source.y};
    });
    var obstacles=(options.obstacles||[]).map(cleanFrame).map(function (o) { return {left:Math.max(f.left,o.left),right:Math.min(f.right,o.right),top:Math.max(f.top,o.top),bottom:Math.min(f.bottom,o.bottom)}; })
      .filter(function (o) { return o.right>o.left && o.bottom>o.top; });
    if(!items.length) return result([],[],f,'spatial',true,null,f,gap,obstacles);
    var W=f.right-f.left,H=f.bottom-f.top;
    if(items.some(function (a) { return a.width>W+EPS; })) return reading(items,f,gap,obstacles,'label-width-exceeds-frame');
    if(items.some(function (a) { return a.height>H+EPS; })) return reading(items,f,gap,obstacles,'label-height-exceeds-frame');
    if(items.reduce(function (s,a) { return s+a.width*a.height; },0)>W*H+EPS) return reading(items,f,gap,obstacles,'label-area-exceeds-frame');
    var best=null,bestValue=Infinity,bestMode='spatial';
    function accept(placements,mode) {
      if(!placements || placements.length!==items.length || !valid(placements,f,obstacles,gap)) return;
      var value=cost(placements);
      if(value<bestValue-EPS) {best=placements;bestValue=value;bestMode=mode;}
    }
    var anchored=items.map(function (a) { var x=clamp(a.x,f.left+a.width/2,f.right-a.width/2),y=clamp(a.y,f.top+a.height/2,f.bottom-a.height/2);return {item:a,x:x,y:y,rect:rect(x,y,a.width,a.height)}; });
    if(valid(anchored,f,obstacles,gap)) return result(items,anchored,f,'spatial',true,null,f,gap,obstacles);
    var prior=items.every(function (a) { return a.prior; })?items.map(function (a) { return {item:a,x:a.prior.x,y:a.prior.y,rect:rect(a.prior.x,a.prior.y,a.width,a.height)}; }):null;
    var held=items.every(function (a) { return a.held; })?items.map(function (a) { return {item:a,x:a.held.x,y:a.held.y,rect:rect(a.held.x,a.held.y,a.width,a.height)}; }):null;
    accept(prior,'spatial');
    accept(held,'spatial');
    // Passing the whole prior result makes repeated Leaflet events with the
    // same geometry cheap. The previous rectangles still have to be valid.
    var previousFrame=options.previous && options.previous.frame;
    if(prior && best && previousFrame && ['left','right','top','bottom'].every(function (key) { return Math.abs(previousFrame[key]-f[key])<EPS; }) && items.every(function (a) {
      var p=previous.get(a.key);return p && Math.hypot(a.x-a.referenceX,a.y-a.referenceY)<=6 && Math.abs(p.width-a.width)<EPS && Math.abs(p.height-a.height)<EPS;
    })) {
      // Keep tiny camera movements continuous. References intentionally survive
      // reuse, so a slow pan accumulates distance and still triggers relayout.
      var continuous=valid(prior,f,obstacles,gap)?prior:valid(held,f,obstacles,gap)?held:null;
      if(continuous)return result(items,continuous,f,options.previous.mode==='packed'?'packed':'spatial',true,null,f,gap,obstacles,true);
    }
    var yOrder=function (a,b) { return a.y-b.y || a.x-b.x || compareId(a,b); };
    var xOrder=function (a,b) { return a.x-b.x || a.y-b.y || compareId(a,b); };
    var orders=[items.slice().sort(yOrder),items.slice().sort(xOrder),items.slice().sort(function (a,b) { return b.height-a.height || yOrder(a,b); }),items.slice().sort(function (a,b) { return b.width-a.width || yOrder(a,b); }),items.slice().sort(function (a,b) { return b.width*b.height-a.width*a.height || yOrder(a,b); })];
    if(prior) orders.unshift(items.slice().sort(function (a,b) { return a.prior.y-b.prior.y || a.prior.x-b.prior.x || compareId(a,b); }));
    orders.forEach(function (order) { accept(greedy(order,f,obstacles,gap),'spatial'); });
    var capacities=[W];
    obstacles.forEach(function (o) {
      var available=Math.max(o.left-f.left-gap,f.right-o.right-gap);
      if(available>=Math.max.apply(null,items.map(function (a) { return a.width; })) && !capacities.some(function (v) { return Math.abs(v-available)<1; })) capacities.push(available);
    });
    orders.forEach(function (order) { capacities.forEach(function (capacity) {
      shelfCandidates(partition(order,capacity,gap),f,obstacles,gap,accept);
      shelfCandidates(binPlan(order,capacity,gap),f,obstacles,gap,accept);
    }); });
    if(!best) bandCandidates(items,f,obstacles,gap,accept);
    if(!best) return reading(items,f,gap,obstacles,'no-safe-spatial-placement-found');
    // A valid prior placement must improve by at least 8% before replacing it.
    // This prevents tiny pan/zoom changes from repeatedly swapping row topology.
    if(prior && valid(prior,f,obstacles,gap) && cost(prior)<=bestValue*1.08+16) {best=prior;bestMode='spatial';}
    else if(held && valid(held,f,obstacles,gap) && cost(held)<=bestValue*1.08+16) {best=held;bestMode='spatial';}
    return result(items,best,f,bestMode,true,null,f,gap,obstacles);
  };
});
