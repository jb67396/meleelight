import {playerType, player, characterSelections, screenShake, gameMode, percentShake} from "main/main";

import {gameSettings} from "settings";
import {sounds} from "main/sfx";
import {turnOffHitboxes, actionStates} from "physics/actionStateShortcuts";
import {drawVfx} from "main/vfx/drawVfx";
import {Vec2D} from "../main/util/Vec2D";
import {Segment2D} from "../main/util/Segment2D";
import {euclideanDist} from "../main/linAlg";
import {getSameAndOther} from "./environmentalCollision";
import {sweepCircleVsSweepCircle, sweepCircleVsAABB} from "./interpolatedCollision";
/* eslint-disable */

export let hitQueue = [];
export function resetHitQueue(){
  hitQueue =[];
}
export let phantomQueue = [];
export function setPhantonQueue(val){
  phantomQueue = val;
}
const angleConversion = Math.PI / 180;

export function hitDetect (p,input){
    var attackerClank = false;
    for (var i = 0; i < 8; i++) {
        if (playerType[i] > -1) {
            if (i != p) {
                // check if victim is already in hitList
                var inHitList = false;
                for (var k = 0; k < player[p].hitboxes.hitList.length; k++) {
                    if (i == player[p].hitboxes.hitList[k]) {
                        inHitList = true;
                        break;
                    }
                }
                if (!inHitList) {
                    var storedPhantom = -1;
                    for (var j = 0; j < 8; j++) {
                        if (player[p].hitboxes.active[j] && player[p].phys.prevFrameHitboxes.active[j]) {
                            var interpolate = true;
                        } else {
                            var interpolate = false;
                        }
                        if (player[p].hitboxes.active[j] && !(player[p].phys.thrownHitbox && player[p].phys.thrownHitboxOwner ==
                            i) && player[p].hitboxes.id[j].type != 7) {
                            //console.log(player[i].phys.shielding);
                            // clank == 6 means special clank
                            if (player[p].hitboxes.id[j].clank == 1 || (player[p].hitboxes.id[j].clank == 2 && player[p].phys.grounded) ||
                                player[p].hitboxes.id[j].clank == 6) {
                                for (var k = 0; k < 8; k++) {
                                    if (player[i].hitboxes.active[k] && (player[i].hitboxes.id[k].clank == 1 || (player[i].hitboxes.id[
                                            k].clank == 2 && player[i].phys.grounded) || (player[p].hitboxes.id[j].clank == 6 && player[i]
                                            .hitboxes.id[k].clank != 6))) {

                                        var clankHit = interpolate && player[i].phys.prevFrameHitboxes.active[k]
                                                     ? interpolatedHitHitCollision(i,p,j,k)
                                                     : hitHitCollision(i, p, j, k); // also need to do interpolated vs non-interpolated hitboxes
                                        if (clankHit[0]) {

                                            var diff = player[p].hitboxes.id[j].dmg - player[i].hitboxes.id[k].dmg;
                                            if (player[p].hitboxes.id[j].clank == 6) {
                                                attackerClank = true;
                                                drawVfx({
                                                  name: "clank",
                                                  pos: clankHit[1]
                                                });
                                                player[p].phys.hurtBoxState = 1;
                                                player[p].phys.intangibleTimer = 1;
                                                // double check still in action state for some weird case
                                                if (actionStates[characterSelections[p]][player[p].actionState].specialClank) {
                                                    actionStates[characterSelections[p]][player[p].actionState].onClank(p,input);
                                                }
                                            } else {
                                                if (diff >= 9) {
                                                    // victim clank
                                                    // attacker cut through
                                                    player[i].hit.hitlag = Math.floor(player[p].hitboxes.id[j].dmg * (1 / 3) + 3);
                                                    turnOffHitboxes(i);
                                                    actionStates[characterSelections[i]].CATCHCUT.init(i,input);
                                                } else if (diff <= -9) {
                                                    // attacker clank
                                                    // victim cut through
                                                    player[p].hit.hitlag = Math.floor(player[i].hitboxes.id[k].dmg * (1 / 3) + 3);
                                                    attackerClank = true;
                                                    turnOffHitboxes(p);
                                                    actionStates[characterSelections[p]].CATCHCUT.init(p,input);
                                                } else {
                                                    // both clank
                                                    player[i].hit.hitlag = Math.floor(player[p].hitboxes.id[j].dmg * (1 / 3) + 3);
                                                    player[p].hit.hitlag = Math.floor(player[i].hitboxes.id[k].dmg * (1 / 3) + 3);
                                                    attackerClank = true;
                                                    turnOffHitboxes(i);
                                                    actionStates[characterSelections[i]].CATCHCUT.init(i,input);
                                                    turnOffHitboxes(p);
                                                    actionStates[characterSelections[p]].CATCHCUT.init(p,input);
                                                }
                                                sounds.clank.play();
                                                drawVfx({
                                                  name: "clank",
                                                  pos: clankHit[1]
                                                });
                                                player[p].hitboxes.hitList.push(i);
                                                player[p].hasHit = true;
                                            }
                                            break;
                                        }

                                    }
                                }
                            }
                            if (!attackerClank) {
                                if (player[i].phys.shielding && player[p].hitboxes.id[j].hitGrounded && (hitShieldCollision(i, p, j,
                                        false) || (interpolate && (hitShieldCollision(i, p, j, true) || interpolatedHitCircleCollision(
                                        player[i].phys.shieldPositionReal, player[i].phys.shieldSize, p, j))))) {
                                    hitQueue.push([i, p, j, true, false, false]);
                                    player[p].hitboxes.hitList.push(i);
                                    setHasHit(p, j);
                                    break;
                                } else if (player[i].phys.hurtBoxState != 1) {
                                    //
                                    if ((player[p].hitboxes.id[j].hitGrounded && player[i].phys.grounded) || (player[p].hitboxes.id[j].hitAirborne &&
                                        !player[i].phys.grounded))
                                        if (hitHurtCollision(i, p, j, false) || (interpolate && (interpolatedHitHurtCollision(i, p, j) ||
                                            hitHurtCollision(i, p, j, true)))) {
                                            if (!hitHurtCollision(i, p, j, false, true) && (interpolate ? !interpolatedHitHurtCollision(i,
                                                    p, j, true) : true)) {
                                                storedPhantom = j;
                                            } else {
                                                hitQueue.push([i, p, j, false, false, false, false]);
                                                if(player[p].hitboxes)
                                                if(player[p].hitboxes.hitList)
                                                if(player[p].hitboxes.hitList instanceof Array)
                                                player[p].hitboxes.hitList.push(i);
                                                setHasHit(p, j);
                                                break;
                                            }
                                        }
                                }
                            }
                        }
                        if (storedPhantom > -1) {
                            hitQueue.push([i, p, storedPhantom, false, false, false, true]);
                            player[p].hitboxes.hitList.push(i);
                            setHasHit(p, storedPhantom);
                        }
                    }
                }

            }
        }
    }
}

export function setHasHit (p,j){
  // for turbo mode. if not a grab and not counter and not a midthrow hitbox.
  if (player[p].hitboxes.id[j].type != 2 && player[p].hitboxes.id[j].type != 6 && player[p].actionState.substr(0, 5) !=
    "THROW") {
    player[p].hasHit = true;
  }
}

export function hitHitCollision (i,p,j,k){


  let framePos1 = player[p].hitboxes.frame;
  if(framePos1 > 1){
    framePos1 = 1;
  }
  let framePos2 = player[i].hitboxes.frame;
  if(framePos2 > 1){
    framePos2 = 1;
  }
  var hbpos = new Vec2D(player[p].phys.pos.x + (player[p].hitboxes.id[j].offset[framePos1].x * player[
            p].phys.face), player[p].phys.pos.y + player[p].hitboxes.id[j].offset[framePos1].y);
    var hbpos2 = new Vec2D(player[i].phys.pos.x + (player[i].hitboxes.id[k].offset[framePos2].x * player[
            i].phys.face), player[i].phys.pos.y + player[i].hitboxes.id[k].offset[framePos2].y);

    var hitPoint = new Vec2D((hbpos.x + hbpos2.x) / 2, (hbpos.y + hbpos2.y) / 2);

    return [    Math.pow(hbpos2.x - hbpos.x, 2) + Math.pow(hbpos.y - hbpos2.y, 2)
             <= Math.pow(player[p].hitboxes.id[j].size + player[i].hitboxes.id[k].size, 2)
           , hitPoint];
}

export function interpolatedHitHitCollision(i,p,j,k) {
  const h1p = new Vec2D ( player[p].phys.posPrev.x + (player[p].phys.prevFrameHitboxes.id[j].offset[player[p].phys.prevFrameHitboxes.frame].x * player[p].phys.facePrev)
                        , player[p].phys.posPrev.y +  player[p].phys.prevFrameHitboxes.id[j].offset[player[p].phys.prevFrameHitboxes.frame].y );
  const h2p = new Vec2D ( player[p].phys.pos.x + (player[p].hitboxes.id[j].offset[player[p].hitboxes.frame].x * player[p].phys.face)
                        , player[p].phys.pos.y +  player[p].hitboxes.id[j].offset[player[p].hitboxes.frame].y );
  const h1i = new Vec2D ( player[i].phys.posPrev.x + (player[i].phys.prevFrameHitboxes.id[k].offset[player[i].phys.prevFrameHitboxes.frame].x * player[i].phys.facePrev)
                        , player[i].phys.posPrev.y +  player[i].phys.prevFrameHitboxes.id[k].offset[player[i].phys.prevFrameHitboxes.frame].y );
  const h2i = new Vec2D ( player[i].phys.pos.x + (player[i].hitboxes.id[k].offset[player[i].hitboxes.frame].x * player[p].phys.face)
                        , player[i].phys.pos.y +  player[i].hitboxes.id[k].offset[player[i].hitboxes.frame].y );
  const r = player[p].hitboxes.id[j].size;
  const s = player[i].hitboxes.id[k].size;

  const collision = sweepCircleVsSweepCircle ( h1p, r, h2p, r, h1i, s, h2i, s );

  if (collision === null) {
    return [false, null];
  }
  else {
    return [true, collision];
  }

}

export function hitShieldCollision (i,p,j,previous){
    if (previous) {
      let checkPreviousFrame = player[p].phys.prevFrameHitboxes.frame;
      if( checkPreviousFrame> 1){
        checkPreviousFrame = 1;
      }
        var hbpos = new Vec2D(player[p].phys.posPrev.x + (player[p].phys.prevFrameHitboxes.id[j].offset[checkPreviousFrame].x * player[p].phys.facePrev), player[p].phys.posPrev.y + player[p].phys.prevFrameHitboxes.id[j].offset[checkPreviousFrame].y);
    } else {
      let checkFrame = player[p].hitboxes.frame;
      if( checkFrame> 1){
        checkFrame = 1;
      }
        var hbpos = new Vec2D(player[p].phys.pos.x + (player[p].hitboxes.id[j].offset[checkFrame].x *
            player[p].phys.face), player[p].phys.pos.y + player[p].hitboxes.id[j].offset[checkFrame].y);
    }
    var shieldpos = player[i].phys.shieldPositionReal;

    return (Math.pow(shieldpos.x - hbpos.x, 2) + Math.pow(hbpos.y - shieldpos.y, 2) <= Math.pow(player[p].hitboxes.id[j]
            .size + player[i].phys.shieldSize, 2));
}

export function interpolatedHitCircleCollision (circlePos,r,p,j){

  let prevPosFrame = player[p].phys.prevFrameHitboxes.frame;
  if (prevPosFrame > 1){
    prevPosFrame = 1;
  }
  let posFrame = player[p].hitboxes.frame;
  if (posFrame > 1){
    posFrame = 1;
  }
  var h1 = new Vec2D(player[p].phys.posPrev.x + (player[p].phys.prevFrameHitboxes.id[j].offset[prevPosFrame].x * player[p].phys.facePrev), player[p].phys.posPrev.y + player[p].phys.prevFrameHitboxes.id[j].offset[
            prevPosFrame].y);
  var h2 = new Vec2D(player[p].phys.pos.x + (player[p].hitboxes.id[j].offset[posFrame].x * player[p].phys
            .face), player[p].phys.pos.y + player[p].hitboxes.id[j].offset[posFrame].y);
  const s = player[p].hitboxes.id[j].size;
  const collision = sweepCircleVsSweepCircle ( h1, s, h2, s, circlePos, r, circlePos, r );

  if (collision === null) {
    return false;
  }
  else {
    return true;
  }
}

export function segmentSegmentCollision (a1,a2,b1,b2){
    var intersection = new Vec2D(0, 0);
    var b = new Vec2D(a2.x - a1.x, a2.y - a1.y);
    var d = new Vec2D(b2.x - b1.x, b2.y - b1.y);
    var bDotDPerp = b.x * d.y - b.y * d.x;
    // if b dot d == 0, it means the lines are parallel so have infinite intersection points
    if (bDotDPerp == 0) {
        return false;
    }
    var c = new Vec2D(b1.x - a1.x, b1.y - a1.y);
    var t = (c.x * d.y - c.y * d.x) / bDotDPerp;
    if (t < 0 || t > 1) {
        return false;
    }
    var u = (c.x * b.y - c.y * b.x) / bDotDPerp;
    if (u < 0 || u > 1) {
        return false;
    }
    intersection = new Vec2D(a1.x + t * b.x, a1.y + t * b.y);
    return true;
}

export function interpolatedHitHurtCollision (i,p,j,phantom){
  phantom = phantom || false;
  const hurt = player[i].phys.hurtbox;
  let hb;
  if (phantom) {
    hb = player[p].phys.interPolatedHitbox[j];
  } else {
    hb = player[p].phys.interPolatedHitboxPhantom[j];
  }

  const h1 = new Vec2D (0.5*hb[0].x + 0.5*hb[3].x, 0.5*hb[0].y + 0.5*hb[3].y);
  const h2 = new Vec2D (0.5*hb[1].x + 0.5*hb[2].x, 0.5*hb[1].y + 0.5*hb[2].y);
  const r = 0.5 * euclideanDist(hb[0], hb[3]);

  const collision = sweepCircleVsAABB ( h1, r, h2, r, hurt.min, hurt.max );

  if (collision === null) {
    return false;
  }
  else {
    return true;
  }
}

export function hitHurtCollision (i,p,j,previous,phantom){
    phantom = phantom || false;
  let playerframe = player[p].hitboxes.frame;
  if(playerframe > 1){
    playerframe = 1;
  }
  var offset = player[p].hitboxes.id[j].offset[playerframe];
    if (offset === undefined){
      return false;
    }
    if (player[p].actionState == "DAMAGEFLYN") {
        offset = player[p].hitboxes.id[j].offset[0];
    }
    if (previous) {
      let prevframe = player[p].phys.prevFrameHitboxes.frame;
      if(prevframe > 1){
        prevframe = 1;
      }
      const prevoffset = player[p].phys.prevFrameHitboxes.id[j].offset[prevframe];
      if(prevoffset === undefined){
        return false;
      }
      var hbpos = new Vec2D(player[p].phys.posPrev.x + (prevoffset.x * player[p].phys.facePrev), player[p].phys.posPrev.y + prevoffset.y);
    } else {
        var hbpos = new Vec2D(player[p].phys.pos.x + (offset.x * player[p].phys.face), player[p].phys.pos.y + offset.y);
    }
    var hurtCenter = new Vec2D((player[i].phys.hurtbox.min.x + player[i].phys.hurtbox.max.x) / 2, (player[i].phys.hurtbox
            .min.y + player[i].phys.hurtbox.max.y) / 2);

    var distance = new Vec2D(Math.abs(hbpos.x - hurtCenter.x), Math.abs(hbpos.y - hurtCenter.y));

    var hurtWidth = 8;
    var hurtHeight = 18;

    if (distance.x > (hurtWidth / 2 + player[p].hitboxes.id[j].size - (phantom ? gameSettings.phantomThreshold : 0))) {
        return false; }
    if (distance.y > (hurtHeight / 2 + player[p].hitboxes.id[j].size - (phantom ? gameSettings.phantomThreshold : 0))) {
        return false; }

    if (distance.x <= (hurtWidth / 2)) {
        return true; }
    if (distance.y <= (hurtHeight / 2)) {
        return true; }

    var cornerDistance_sq = Math.pow(distance.x - hurtWidth / 2, 2) +
        Math.pow(distance.y - hurtHeight / 2, 2);

    return (cornerDistance_sq <= (Math.pow(player[p].hitboxes.id[j].size - (phantom ? gameSettings.phantomThreshold : 0),
        2)));
}

export function cssHits(input) {
  for (var i = 0; i < hitQueue.length; i++) {

    var v = hitQueue[i][0];
    if(v === -1){
      continue;
    }
    var a = hitQueue[i][1];
    var h = hitQueue[i][2];
    var shieldHit = hitQueue[i][3];
    var isThrow = hitQueue[i][4];
    var drawBounce = hitQueue[i][5];
    var phantom = hitQueue[i][6] || false;
    let frame = player[i].hitboxes.frame;
    if(frame > 1){
      frame = 1;
    }
    const damage = player[a].hitboxes.id[h].dmg;

    if (shieldHit) {
      sounds.blunthit.play();
      player[v].hit.hitlag = Math.floor(damage * (1 / 3) + 3);
      if (player[v].phys.powerShieldActive) {
        player[v].phys.powerShielded = true;
        player[v].hit.powershield = true;
        drawVfx({
          name: "impactLand",
          pos: player[v].phys.pos,
          face: player[v].phys.face
        });
        drawVfx({
          name: "powershield",
          pos: player[v].phys.shieldPositionReal,
          face: player[v].phys.face
        });
        sounds.powershield.play();
      }
      player[v].hit.shieldstun = ((Math.floor(damage) * ((0.65 * (1 - ((player[v].phys.shieldAnalog - 0.3) / 0.7))) +
            0.3)) * 1.5) + 2;
    } else {
      player[a].rpsPoints++;
      player[v].hit.hitlag = Math.floor(damage * (1 / 3) + 3);
      player[v].hit.knockback = getKnockback(player[a].hitboxes.id[h], damage, damage, 0, player[v].charAttributes.weight,
            false, false);
      player[v].hit.hitPoint = new Vec2D(player[a].phys.pos.x + (player[a].hitboxes.id[h].offset[frame].x * player[a].phys.face), player[a].phys.pos.y + player[a].hitboxes.id[h].offset[frame].y);
      if (player[a].phys.pos.x < player[v].phys.pos.x) {
        player[v].hit.reverse = false;
        player[v].phys.face = -1;
      } else {
        player[v].hit.reverse = true;
        player[v].phys.face = 1;
      }
      actionStates[characterSelections[v]].DAMAGEN2.init(v,input);
      screenShake(player[v].hit.knockback);
      sounds.swordreallystronghit.play();
    }
  }
}

export function executeShieldHit(input, v, a, h, damage) {
  if (!player[v].phys.powerShieldActive) {
    player[v].phys.shieldHP -= damage;
    if (player[v].phys.shieldHP < 0) {
      player[v].phys.shielding = false;
      player[v].phys.cVel.y = 2.5;
      player[v].phys.grounded = false;
      player[v].phys.shieldHP = 0;
      drawVfx({
        name: "breakShield",
        pos: player[v].phys.pos,
        face: player[v].phys.face
      });
      actionStates[characterSelections[v]].SHIELDBREAKFALL.init(v,input);
      sounds.shieldbreak.play();
      return;
    }
  }
  player[v].hit.hitlag = Math.floor(damage * (1 / 3) + 3);

  let vPushMultiplier = 0.6;
  if (player[v].phys.powerShieldActive) {
    vPushMultiplier = 1;
    player[v].phys.powerShielded = true;
    player[v].hit.powershield = true;
    drawVfx({
      name: "impactLand",
      pos: player[v].phys.pos,
      face: player[v].phys.face
    });
    drawVfx({
      name: "powershield",
      pos: player[v].phys.shieldPositionReal,
      face: player[v].phys.face
    });
    sounds.powershield.play();
  } else {
    let frame = player[v].hitboxes.frame;
    if(frame > 1){
      frame = 1;
    }
    drawVfx({
      name: "clank",
      pos: new Vec2D(player[a].phys.pos.x + (player[a].hitboxes.id[h].offset[player[a].hitboxes.frame].x * player[a].phys.face), player[a].phys.pos.y + player[a].hitboxes.id[h].offset[player[a].hitboxes.frame].y)
    });
  }
  player[v].hit.shieldstun = ((Math.floor(damage) * ((0.65 * (1 - ((player[v].phys.shieldAnalog - 0.3) / 0.7))) + 0.3)) * 1.5) + 2;
  let victimPush = ((Math.floor(damage) * ((0.195 * (1 - ((player[v].phys.shieldAnalog - 0.3) / 0.7))) + 0.09)) +
          0.4) * vPushMultiplier;
  if (victimPush > 2) {
    victimPush = 2;
  }
  let attackerPush = (Math.floor(damage) * ((player[v].phys.shieldAnalog - 0.3) * 0.1)) + 0.02;

  if (player[a].phys.pos.x < player[v].phys.pos.x) {
    player[v].phys.cVel.x = victimPush
    player[a].phys.cVel.x -= attackerPush
  } else {
    player[v].phys.cVel.x = -victimPush
    player[a].phys.cVel.x += attackerPush
  }

  actionStates[characterSelections[v]].GUARD.init(v,input);
}

export function bluntHit(a,h){
  sounds.blunthit.play();
  let frame = player[a].hitboxes.frame;
  if(frame > 1){
    frame = 1;
  }
  drawVfx("clank", new Vec2D(player[a].phys.pos.x + (player[a].hitboxes.id[h].offset[frame].x * player[a].phys.face), player[a].phys.pos.y + player[a].hitboxes.id[h].offset[frame].y));
}

export function executeRegularHit (input, v, a, h, shieldHit, isThrow, drawBounce, phantom, stageDamage, hitbox) {
  let damage = hitbox.dmg;
  player[v].phys.grabTech = false;
  if (!stageDamage){
    if (player[a].phys.chargeFrames > 0) {
      damage *= 1 + (player[a].phys.chargeFrames * (0.3671 / 60));
    }
    if (actionStates[characterSelections[a]][player[a].actionState].specialOnHit) {
      actionStates[characterSelections[a]][player[a].actionState].onPlayerHit(a);
      if (hitbox.type === 8) return;
    }
    if (phantom) {
      phantomQueue.push([a, v]);
      player[v].phys.phantomDamage = 0.5 * damage;
    } else {
      player[a].hit.hitlag = Math.floor(damage * (1 / 3) + 3);
    }
  }
  // TODO: STALING + KNOCKBACK STACKING

  if (shieldHit) {
    executeShieldHit(input, v, a, h, damage);
    return;
  }
  // if invincible
  if (player[v].phys.hurtboxState > 0 && !isThrow) {
    if (!stageDamage){
      bluntHit(a, h);
    }
    return;
  }
  if (phantom) {
    player[v].hit.hitlag = Math.floor(damage * (1 / 3) + 3);
    player[v].hit.knockback = 0;
    let frame = player[a].hitboxes.frame;
    if(frame > 1){
      frame = 1;
    }
    player[v].hit.hitPoint = new Vec2D(player[a].phys.pos.x + (hitbox.offset[frame].x * player[a].phys.face), player[a].phys.pos.y + hitbox.offset[frame].y);
    hitEffectsAndSound(a,v,h,isThrow);
    return;
  }

  let crouching = actionStates[characterSelections[v]][player[v].actionState].crouch;
  let vCancel = false;
  if (player[v].phys.vCancelTimer > 0) {
    if (actionStates[characterSelections[v]][player[v].actionState].vCancel) {
      vCancel = true;
      sounds.vcancel.play();
    }
  }
  let jabReset = false;
  if (actionStates[characterSelections[v]][player[v].actionState].downed && damage < 7) {
    jabReset = true;
  }
  player[v].hit.knockback = getKnockback(hitbox, damage, damage, player[v].percent, player[v].charAttributes.weight, crouching, vCancel);
  player[v].hit.angle = hitbox.angle;
  if (player[v].hit.angle == 361) {
    if (player[v].hit.knockback < 32.1) {
      player[v].hit.angle = 0;
    } else if (player[v].hit.knockback >= 32.1) {
      player[v].hit.angle = 44;
    }
  }

  player[v].hit.hitlag = Math.floor(damage * (1 / 3) + 3);

  if (!isThrow) {
    if (stageDamage) {
      const angularParameter = a.angular;
      let collisionPoint;
      if (a.corner) {
        const [same, other] = getSameAndOther(angularParameter);
        const t = angularParameter - Math.floor(angularParameter);
        if ((same === 1 && other === 2) || (same === 3 && other === 0)) {
          collisionPoint = new Vec2D( (1-t)*player[v].phys.ECBp[same].x+t*player[v].phys.ECBp[other].x
                                    , (1-t)*player[v].phys.ECBp[same].y+t*player[v].phys.ECBp[other].y );
        }
        else {
          collisionPoint = new Vec2D( (1-t)*player[v].phys.ECBp[other].x+t*player[v].phys.ECBp[same].x
                                    , (1-t)*player[v].phys.ECBp[other].y+t*player[v].phys.ECBp[same].y );
        }
      }
      else {
        collisionPoint = player[v].phys.ECBp[angularParameter];
      }
      player[v].hit.hitPoint = collisionPoint;
      player[v].hit.reverse = false;
      player[v].phys.stageDamageImmunity = 20;
    } else {
      let frame = player[a].hitboxes.frame;
      if(frame > 1){
        frame = 1;
      }
      player[v].hit.hitPoint = new Vec2D(player[a].phys.pos.x + (hitbox.offset[frame].x * player[a].phys.face), player[a].phys.pos.y + hitbox.offset[frame].y);
      if (player[a].phys.pos.x < player[v].phys.pos.x) {
        player[v].hit.reverse = false;
      } else {
        player[v].hit.reverse = true;
      }
    }
    if (!jabReset && player[v].phys.grabbedBy == -1) {
      player[v].phys.face = player[v].hit.reverse ? 1 : -1;
    }
  } else {
    player[a].hasHit = true;
    player[a].phys.grabbing = -1;
    player[v].phys.thrownHitbox = true;
    player[v].phys.thrownHitboxOwner = a;
    player[v].phys.pos = new Vec2D(player[a].phys.pos.x + (hitbox.offset.x * player[a].phys.face), player[a].phys.pos.y + hitbox.offset.y);
    player[v].phys.grabbedBy = -1;
    player[v].hit.hitlag = 1;
    player[a].hit.hitlag = 1;
    if (player[a].phys.face == 1) {
      player[v].hit.reverse = false;
    } else {
      player[v].hit.reverse = true;
    }
    if (drawBounce) {
      sounds.bounce.play();
      drawVfx({
        name: "groundBounce",
        pos: player[v].phys.pos,
        face: player[v].phys.face,
        f: Math.PI / 2
      });
    }
  }

  player[v].percent += damage;

  // if victim is grabbing someone, put the victim's grab victim into a grab release
  if (player[v].phys.grabbing > -1) {
    player[player[v].phys.grabbing].phys.grabbedBy = -1;
    actionStates[characterSelections[player[v].phys.grabbing]].CAPTURECUT.init(player[v].phys.grabbing,input);
  }

  if (player[v].phys.grabbedBy == -1 || (player[v].phys.grabbedBy > -1 && player[v].hit.knockback > 50 && !hitbox.throwextra)) {
    if (player[v].phys.grabbedBy > -1) {
      player[player[v].phys.grabbedBy].phys.grabbing = -1;
      actionStates[characterSelections[player[v].phys.grabbedBy]].WAIT.init(player[v].phys.grabbedBy,input);
    }
    player[v].hit.hitstun = getHitstun(player[v].hit.knockback);

    if (jabReset) {
      actionStates[characterSelections[v]].DOWNDAMAGE.init(v,input);
    } else if (player[v].hit.knockback >= 80 || isThrow) {
      actionStates[characterSelections[v]].DAMAGEFLYN.init(v,input, !isThrow);
    } else {
      actionStates[characterSelections[v]].DAMAGEN2.init(v,input);
    }
  } else {
    if (!hitbox.throwextra) {
    //if (player[v].actionState != "THROWNPUFFDOWN" && player[v].actionState != "THROWNFALCONBACK" && player[v].actionState != "THROWNFALCONFORWARD" && player[v].actionState != "THROWNFALCONUP") {
      actionStates[characterSelections[v]].CAPTUREDAMAGE.init(v,input);
    }
  }

  if (player[v].phys.grounded && player[v].hit.angle > 180) {
    if (player[v].hit.knockback >= 80) {
      sounds.bounce.play();
      drawVfx({
        name: "groundBounce",
        pos: player[v].phys.pos,
        face: player[v].phys.face,
        f: Math.PI / 2
      });
      player[v].hit.angle = 360 - player[v].hit.angle;
      player[v].hit.knockback *= 0.8;
    }
  }
  screenShake(player[v].hit.knockback);
  percentShake(player[v].hit.knockback, v);
  hitEffectsAndSound(v,h,isThrow, hitbox.type);
}

export function hitEffectsAndSound(v,h, isThrow, type){
  if (!isThrow) {
    hitEffect(type,v);
    knockbackSounds(type, player[v].hit.knockback, v);
  } else {
    sounds.stronghit.play();
  }
}

export function hitEffect(type,v){
  switch (type) {
    case 0:
      // normal
      drawVfx({
        name: "normalhit",
        pos: player[v].hit.hitPoint,
        face: player[v].phys.face
      });
      break;
    case 1:
      // slash
      drawVfx({
        name: "hitSparks",
        pos: player[v].hit.hitPoint,
        face: player[v].phys.face
      });
      drawVfx({
        name: "hitFlair",
        pos: player[v].hit.hitPoint,
        face: player[v].phys.face
      });
      drawVfx({
        name: "hitCurve",
        pos: player[v].hit.hitPoint,
        face: player[v].phys.face,
        f: player[v].hit.angle
      });
      break;
    case 3:
      // fire
      player[v].burning = 20;
      drawVfx({
        name: "firehit",
        pos: player[v].hit.hitPoint,
        face: player[v].phys.face
      });
      break;
    case 4:
      // electric
      player[v].shocked = 20;
      drawVfx({
        name: "electrichit",
        pos: player[v].hit.hitPoint,
        face: player[v].phys.face
      });
      break;
    default:
      break;
  }
}

export function executeHits (input){
  if (gameMode === 2) {
    cssHits(input);
    return;
  }
  let grabQueue = [];
  let ignoreGrabs = [false, false, false, false];
  for (var i = 0; i < hitQueue.length; i++) {
    // start defining constants for hit
    const v = hitQueue[i][0];
    const a = hitQueue[i][1];
    // h will contain hitbox type for stage damage
    const h = hitQueue[i][2];
    const shieldHit = hitQueue[i][3];
    const isThrow = hitQueue[i][4];
    const drawBounce = hitQueue[i][5];
    const phantom = hitQueue[i][6] || false;
    // if a is a string, then it is stage damage
    const stageDamage = (a >= 0) ? false : true;
    let hitbox;
    if (stageDamage) {
      let normalAngle = Math.atan2(a.normal.y, a.normal.x);
      if (normalAngle < 0) {
        normalAngle += 2*Math.PI;
      }
      hitbox = { offset : new Vec2D(0,0),
                 dmg : 10,
                 angle : normalAngle * 180 / Math.PI, // why are we using degrees again?
                 kg : 100,
                 bk : 0,
                 sk : 150,
                 type : h
                }
    }
    else {
      hitbox = player[a].hitboxes.id[h];
    }

    // if in furafura, make sure sfx stops
    if (player[v].actionState == "FURAFURA") {
      sounds.furaloop.stop(player[v].furaLoopID);
    }
    switch (hitbox.type){
      // if grab
      case 2:
        if (actionStates[characterSelections[v]][player[v].actionState].canBeGrabbed) {
          grabQueue.push([a, v, false]);
        }
        break;
      // if sleep
      case 5:
        actionStates[characterSelections[v]].FURASLEEPSTART.init(v,input);
        break;
      default:
        ignoreGrabs[v] = true;
        executeRegularHit(input, v, a, h, shieldHit, isThrow, drawBounce, phantom, stageDamage, hitbox);
        break;
    }
  }
  executeGrabHits(input, grabQueue, ignoreGrabs);
}

export function executeGrabHits(input, grabQueue, ignoreGrabs){
  for (var j = 0; j < grabQueue.length; j++) {
    if (!ignoreGrabs[grabQueue[j][0]]) {
      if (!grabQueue[j][2]) {
        if (player[grabQueue[j][1]].actionState == "GRAB" && player[grabQueue[j][1]].timer > 0 && player[grabQueue[j]
            [1]].timer < 14 && player[grabQueue[j][1]].phys.face != player[grabQueue[j][0]].phys.face) {
          executeGrabTech(grabQueue[j][0], grabQueue[j][1],input);
          grabQueue[j][2] = true;
          ignoreGrabs[grabQueue[j][1]] = true;
        } else {
          for (var k = 0; k < grabQueue.length; k++) {
            if (k != j) {
              if (grabQueue[j][0] == grabQueue[k][1]) {
                executeGrabTech(grabQueue[j][0], grabQueue[k][0],input);
                grabQueue[j][2] = true;
                grabQueue[k][2] = true;
                break;
              }
            }
          }
        }
      }
      if (!grabQueue[j][2]) {
        var a = grabQueue[j][0];
        var v = grabQueue[j][1];
        if (player[v].phys.grabbedBy == -1 && player[a].phys.grabbing == -1 && player[v].phys.hurtBoxState == 0 && !
          player[v].phys.grabTech) {
          player[v].phys.cVel = new Vec2D(0, 0);
          player[v].phys.kVel = new Vec2D(0, 0);
          player[a].phys.cVel = new Vec2D(0, 0);
          player[a].phys.kVel = new Vec2D(0, 0);
          player[v].phys.grabbedBy = a;
          player[v].phys.shielding = false;
          player[a].phys.grabbing = v;
          turnOffHitboxes(a);
          turnOffHitboxes(v);
          if (player[a].actionState == "UPSPECIAL") {
            player[v].phys.face = player[a].phys.face * -1;
            actionStates[characterSelections[v]].THROWNFALCONDIVE.init(v,input);
          }
          else {
            actionStates[characterSelections[v]].CAPTUREPULLED.init(v,input);
          }
        }
      }
    }
  }
}

export function executeGrabTech (a,v,input){
    if (player[a].phys.pos.x < player[v].phys.pos.x) {
        player[a].phys.face = 1;
        player[v].phys.face = -1;
    } else {
        player[a].phys.face = -1;
        player[v].phys.face = 1;
    }
    player[a].phys.grabTech = true;
    player[v].phys.grabTech = true;
    turnOffHitboxes(a);
    turnOffHitboxes(v);
    actionStates[characterSelections[a]].CAPTURECUT.init(a,input);
    actionStates[characterSelections[v]].CAPTURECUT.init(v,input);
    sounds.parry.play();
    drawVfx({
      name: "shieldup",
      pos: new Vec2D((player[a].phys.pos.x + player[v].phys.pos.x) / 2, player[a].phys.pos.y + 12),
      face: player[v].phys.face,
      f: 3
    });
}

export function getKnockback (hb,damagestaled,damageunstaled,percent,weight,crouching,vCancel) {
    if (hb.sk == 0) {
        var kb = ((0.01 * hb.kg) * ((1.4 * (((0.05 * (damageunstaled * (damagestaled + Math.floor(percent)))) + (
        damagestaled + Math.floor(percent)) * 0.1) * (2.0 - (2.0 * (weight * 0.01)) / (1.0 + (weight * 0.01))))) +
        18) + hb.bk);
    } else {
        //var kb = ((((setKnockback * 10 / 20) + 1) * 1.4 * (200/(weight + 100)) + 18) * (growth / 100)) + base;
        var kb = ((((hb.sk * 10 / 20) + 1) * 1.4 * (200 / (weight + 100)) + 18) * (hb.kg / 100)) + hb.bk;
    }
    if (kb > 2500) {
        kb = 2500;
    }
    if (crouching) {
        kb *= 0.67;
    }
    if (vCancel) {
        kb *= 0.95;
    }

    return kb;
}

export function getLaunchAngle (trajectory, knockback, reverse, x, y, v) {
    var deadzone = false;
    //console.log(trajectory);
    var diAngle;
    if (knockback < 80 && player[v].phys.grounded && (trajectory == 0 || trajectory == 180)) {
        deadzone = true;
    }
    if (x < 0.2875 && x > -0.2875) {
        x = 0;
    }
    if (y < 0.2875 && y > -0.2875) {
        y = 0;
    }
    if (x == 0 && y < 0) {
        diAngle = 270;
    } else if (x == 0 && y > 0) {
        diAngle = 90;
    } else if (x == 0 && y == 0) {
        deadzone = true;
    } else {
        diAngle = Math.atan(y / x) * (180 / Math.PI) * 1;
        if (x < 0) {
            diAngle += 180;
        } else if (y < 0) {
            diAngle += 360;
        }
    }
    //console.log(deadzone);

    if (trajectory == 361) {
        if (knockback < 32.1) {
            if (reverse) {
                trajectory = 180;
            } else {
                trajectory = 0;
            }
        } else if (knockback >= 32.1) {
            if (reverse) {
                trajectory = 136;
            } else {
                trajectory = 44;
            }
        } else {
            prompt("Why would this ever get called?");
            trajectory = 440 * (knockback - 32);
            if (reverse) {
                trajectory = 180 - trajectory;
                if (trajectory < 0) {
                    trajectory = 360 + trajectory;
                }
            }
        }
    } else {
        if (reverse) {
            trajectory = 180 - trajectory;
            if (trajectory < 0) {
                trajectory = 360 + trajectory;
            }
        }
    }

    //console.log(trajectory);

    if (!deadzone) {
        var rAngle = trajectory - diAngle;
        if (rAngle > 180) {
            rAngle -= 360;
        }

        var pDistance = Math.sin(rAngle * angleConversion) * Math.sqrt(x * x + y * y);

        var angleOffset = pDistance * pDistance * 18;
        if (angleOffset > 18) {
            angleOffset = 18;
        }

        if (rAngle < 0 && rAngle > -180) {
            angleOffset *= -1;
        }
    } else {
        var angleOffset = 0;
    }
    var newtraj = trajectory - angleOffset;
    if (newtraj < 0.01) {
        newtraj = 0;
    }
    return newtraj;
}

export function getHorizontalVelocity (knockback, angle) {
  var initialVelocity = knockback * 0.03;
  var horizontalAngle = Math.cos(angle * angleConversion);
  var horizontalVelocity = initialVelocity * horizontalAngle;
  horizontalVelocity = Math.round(horizontalVelocity * 100000) / 100000;
  return horizontalVelocity;
}

export function getVerticalVelocity (knockback, angle,grounded,trajectory) {
  var initialVelocity = knockback * 0.03;
  var verticalAngle = Math.sin(angle * angleConversion);
  var verticalVelocity = initialVelocity * verticalAngle;
  verticalVelocity = Math.round(verticalVelocity * 100000) / 100000;
  if (knockback < 80 && grounded && (trajectory == 0 || trajectory == 180)) {
    verticalVelocity = 0;
  }
  return verticalVelocity;
}

export function getHorizontalDecay (angle) {
  var decay = 0.051 * Math.cos(angle * angleConversion)
  decay = Math.round(decay * 100000) / 100000;
  return decay;
}

export function getVerticalDecay (angle) {
  var decay = 0.051 * Math.sin(angle * angleConversion)
  decay = Math.round(decay * 100000) / 100000;
  return decay;
}

export function getHitstun (knockback) {
  //if (groundDownHitType == "Fly"){
  //knockback *= 1.25;
  //}
  return Math.floor(knockback * .4);
}

export function knockbackSounds (type,knockback,v){
  if (type == 4){
    sounds.firestronghit.play();
  }
  if (knockback < 50) {
    switch (type) {
      case 0:
        sounds.normalweakhit.play();
        break;
      case 1:
        sounds.swordweakhit.play();
        break;
      case 3:
        sounds.fireweakhit.play();
        break;
      default:
        break;
    }
  } else if (knockback < 100) {
    switch (type) {
      case 0:
        sounds.normalmediumhit.play();
        break;
      case 1:
        sounds.swordmediumhit.play();
        break;
      case 3:
        sounds.firemediumhit.play();
        break;
      default:
        break;
    }
  } else if (knockback < 140) {
    switch (type) {
      case 0:
        sounds.normalstronghit.play();
        break;
      case 1:
        sounds.swordstronghit.play();
        break;
      case 3:
        sounds.firestronghit.play();
        break;
      default:
        break;
    }
  } else {
    switch (type) {
      case 0:
        sounds.normalstronghit.play();
        break;
      case 1:
        sounds.swordreallystronghit.play();
        break;
      case 3:
        sounds.bathit.play();
        sounds.firestronghit.play();
        break;
      default:
        break;
    }
    sounds.cheer.play();
    if (knockback < 280) {
      sounds.stronghit.play();
      switch (characterSelections[v]) {
        case 0:
          sounds.weakhurt.play();
          break;
        case 2:
          sounds.foxweakhurt.play();
          break;
        case 3:
            sounds.falcohurt1.play();
            break;
        default:
          break;
      }
    } else {
      sounds.strongerhit.play();
      switch (characterSelections[v]) {
        case 0:
          sounds.stronghurt.play();
          break;
        case 1:
          sounds.puffhurt.play();
          break;
        case 2:
          sounds.foxstronghurt.play();
          break;
        case 3:
            sounds.falcohurt2.play();
            break;
        default:
          break;
      }
    }
  }
}

export function checkPhantoms (){
  for (var i = 0; i < phantomQueue.length; i++) {
    var v = phantomQueue[i][1]
    if (player[v].hit.hitlag == 0 && player[v].phys.hurtBoxState == 0) {
      player[v].percent += player[v].phys.phantomDamage;
      player[v].phys.phantomDamage = 0;
      var a = phantomQueue[i][0];
      for (var j = 0; j < player[a].hitboxes.hitList.length; j++) {
        if (player[a].hitboxes.hitList[j] == v) {
          player[a].hitboxes.hitList.splice(j, 1);
          break;
        }
      }
      phantomQueue.splice(i, 1);
    }
  }
}
