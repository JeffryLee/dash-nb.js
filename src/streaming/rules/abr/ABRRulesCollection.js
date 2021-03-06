/**
 * The copyright in this software is being made available under the BSD License,
 * included below. This software may be subject to other third party and contributor
 * rights, including patent rights, and no such rights are granted under this license.
 *
 * Copyright (c) 2013, Dash Industry Forum.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *  * Redistributions of source code must retain the above copyright notice, this
 *  list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above copyright notice,
 *  this list of conditions and the following disclaimer in the documentation and/or
 *  other materials provided with the distribution.
 *  * Neither the name of Dash Industry Forum nor the names of its
 *  contributors may be used to endorse or promote products derived from this software
 *  without specific prior written permission.
 *
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS AS IS AND ANY
 *  EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 *  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 *  IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 *  INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
 *  NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 *  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 *  WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 *  ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 *  POSSIBILITY OF SUCH DAMAGE.
 */
import ThroughputRule from './ThroughputRule';
import InsufficientBufferRule from './InsufficientBufferRule';
import AbandonRequestsRule from './AbandonRequestsRule';
import DroppedFramesRule from './DroppedFramesRule';
import SwitchHistoryRule from './SwitchHistoryRule';
import BolaRule from './BolaRule';
import FactoryMaker from '../../../core/FactoryMaker';
import SwitchRequest from '../SwitchRequest';

const QUALITY_SWITCH_RULES = 'qualitySwitchRules';
const ABANDON_FRAGMENT_RULES = 'abandonFragmentRules';

function ABRRulesCollection(config) {

    config = config || {};
    const context = this.context;

    const mediaPlayerModel = config.mediaPlayerModel;
    const dashMetrics = config.dashMetrics;
    const settings = config.settings;

    let instance,
        qualitySwitchRules,
        abandonFragmentRules;

    function initialize() {
        qualitySwitchRules = [];
        abandonFragmentRules = [];

        if (settings.get().streaming.abr.useDefaultABRRules) {
            // Only one of BolaRule and ThroughputRule will give a switchRequest.quality !== SwitchRequest.NO_CHANGE.
            // This is controlled by useBufferOccupancyABR mechanism in AbrController.
            qualitySwitchRules.push(
                BolaRule(context).create({
                    dashMetrics: dashMetrics,
                    mediaPlayerModel: mediaPlayerModel,
                    settings: settings
                })
            );
            qualitySwitchRules.push(
                ThroughputRule(context).create({
                    dashMetrics: dashMetrics
                })
            );
            qualitySwitchRules.push(
                InsufficientBufferRule(context).create({
                    dashMetrics: dashMetrics
                })
            );
            qualitySwitchRules.push(
                SwitchHistoryRule(context).create()
            );
            qualitySwitchRules.push(
                DroppedFramesRule(context).create()
            );
            abandonFragmentRules.push(
                AbandonRequestsRule(context).create({
                    dashMetrics: dashMetrics,
                    mediaPlayerModel: mediaPlayerModel,
                    settings: settings
                })
            );
        }

        // add custom ABR rules if any
        const customRules = mediaPlayerModel.getABRCustomRules();
        customRules.forEach(function (rule) {
            if (rule.type === QUALITY_SWITCH_RULES) {
                qualitySwitchRules.push(rule.rule(context).create());
            }

            if (rule.type === ABANDON_FRAGMENT_RULES) {
                abandonFragmentRules.push(rule.rule(context).create());
            }
        });
    }

    function getActiveRules(srArray) {
        return srArray.filter(sr => sr.quality > SwitchRequest.NO_CHANGE);
    }

    function getMinSwitchRequest(srArray) {
        const values = {};
        let i,
            len,
            req,
            newQuality,
            quality;

        if (srArray.length === 0) {
            return;
        }

        values[SwitchRequest.PRIORITY.STRONG] = SwitchRequest.NO_CHANGE;
        values[SwitchRequest.PRIORITY.WEAK] = SwitchRequest.NO_CHANGE;
        values[SwitchRequest.PRIORITY.DEFAULT] = SwitchRequest.NO_CHANGE;

        for (i = 0, len = srArray.length; i < len; i += 1) {
            req = srArray[i];
            if (req.quality !== SwitchRequest.NO_CHANGE) {
                values[req.priority] = values[req.priority] > SwitchRequest.NO_CHANGE ? Math.min(values[req.priority], req.quality) : req.quality;
            }
        }

        if (values[SwitchRequest.PRIORITY.WEAK] !== SwitchRequest.NO_CHANGE) {
            newQuality = values[SwitchRequest.PRIORITY.WEAK];
        }

        if (values[SwitchRequest.PRIORITY.DEFAULT] !== SwitchRequest.NO_CHANGE) {
            newQuality = values[SwitchRequest.PRIORITY.DEFAULT];
        }

        if (values[SwitchRequest.PRIORITY.STRONG] !== SwitchRequest.NO_CHANGE) {
            newQuality = values[SwitchRequest.PRIORITY.STRONG];
        }

        if (newQuality !== SwitchRequest.NO_CHANGE) {
            quality = newQuality;
        }

        return SwitchRequest(context).create(quality);
    }


    function last_chunk_size(lastreq) {
        var tot = 0;
        for ( var tt = 0; tt < lastreq.trace.length; tt++ ) {
            tot = tot + lastreq.trace[tt]['b'][0];
        }
        return tot;
    }


    function predict_throughput(lastHTTPRequest) {
        var lastDownloadTime,
        lastThroughput = 0,
        lastChunkSize;

        // First, log last download time and throughput
        if (lastHTTPRequest != null && lastHTTPRequest !== undefined) {
            lastDownloadTime = (lastHTTPRequest._tfinish.getTime() - lastHTTPRequest.tresponse.getTime()) / 1000; //seconds
            
            if (lastDownloadTime <0.1) {
                lastDownloadTime = 0.1;
            }
            lastChunkSize = last_chunk_size(lastHTTPRequest);
            lastThroughput = lastChunkSize*8/lastDownloadTime/1000;
        }

        return lastThroughput;   
    }


    // todo solve last request video and audio conflict
    function decodeRuleConext(rulesContext, playerId, lastRequestedv, lastRequesteda, last_quality, rebuffer, currentPlayerIdx, url) {

        const mediaInfo = rulesContext.getMediaInfo();
        const mediaType = rulesContext.getMediaType();
        const scheduleController = rulesContext.getScheduleController();
        const streamInfo = rulesContext.getStreamInfo();
        const abrController = rulesContext.getAbrController();
        const throughputHistory = abrController.getThroughputHistory();
        const streamId = streamInfo ? streamInfo.id : null;
        const isDynamic = streamInfo && streamInfo.manifestInfo && streamInfo.manifestInfo.isDynamic;
        const useBufferOccupancyABR = rulesContext.useBufferOccupancyABR();
        
        const bitrates = mediaInfo.bitrateList.map(b => b.bandwidth);
        // console.log(mediaInfo);
        
        // console.log('bitrates '+bitrates);
        // console.log();

        // console.log('scheduleController');
        // console.log(scheduleController);
        // console.log(rulesContext.getStreamInfo());
        // console.log(streamId);

        // if (mediaInfo) {
        //     console.log('duration '+ mediaInfo.streamInfo.duration);
        // }

        

        // console.log('mediaType '+ mediaType);

        // console.log('CurrentBufferLevel '+ dashMetrics.getCurrentBufferLevel(mediaType));
        

        var lastHTTPRequest = dashMetrics.getCurrentHttpRequest(mediaType);

        var bandwidthEst = 0;
        var lastChunkFinishTime = 0;
        var lastChunkStartTime = 0;
        var lastChunkSize = 0;

        if (lastHTTPRequest) {
            // var lastDownloadTime = (lastHTTPRequest._tfinish.getTime() - lastHTTPRequest.tresponse.getTime()) / 1000;

            // console.log('lastDownloadTime ' + lastDownloadTime);

            // console.log('lastChunkSize ' + last_chunk_size(lastHTTPRequest));

            bandwidthEst = predict_throughput(lastHTTPRequest);

            lastChunkFinishTime = lastHTTPRequest._tfinish.getTime(), 
            lastChunkStartTime = lastHTTPRequest.tresponse.getTime(), 
            lastChunkSize = last_chunk_size(lastHTTPRequest)
        }

        // console.log('rebuffer '+ rebuffer);

        // console.log('last_quality '+ last_quality);

        // console.log(lastHTTPRequest);

        var buffer = dashMetrics.getCurrentBufferLevel(mediaType);

        // lastRequested

        if (mediaInfo.type == "audio") {
            if (lastRequesteda < lastRequestedv) {
                return 0;
            } else {
                return -2;
            }
        }

        console.log(data);


        var quality = 2;
        var xhr = new XMLHttpRequest();
        xhr.open("POST", "http://localhost:8333", false);
        xhr.onreadystatechange = function() {
            if ( xhr.readyState == 4 && xhr.status == 200 ) {
                // console.log("GOT RESPONSE:" + xhr.responseText + "---");
                if ( xhr.responseText != "REFRESH" ) {
                    quality = parseInt(xhr.responseText, 10);
                } else {
                    document.location.reload(true);
                }
            }
        }

        // need current header
        // need request url
        
        var data = {'nextChunkSize': bitrates, 'Type': 'BB', 'lastquality': last_quality, 'buffer': buffer, 'bandwidthEst': bandwidthEst, 'lastRequest': lastRequestedv, 'RebufferTime': rebuffer, 'lastChunkFinishTime': lastChunkFinishTime, 'lastChunkStartTime': lastChunkStartTime, 'lastChunkSize': lastChunkSize, 'playerId': playerId, 'currentPlayerIdx': currentPlayerIdx, 'url': url};
        xhr.send(JSON.stringify(data));

        return quality;
        // const stableBufferTime = mediaPlayerModel.getStableBufferTime();
        // console.log('stableBufferTime: ' + stableBufferTime);
        // console.log();

    }

    function getMaxQuality(rulesContext, playerId=-1, lastRequestedv=-1, lastRequesteda=-1, last_quality=0, rebuffer=0, currentPlayerIdx=0, url="") {

        const switchRequestArray = qualitySwitchRules.map(rule => rule.getMaxIndex(rulesContext));

        var quality = decodeRuleConext(rulesContext, playerId, lastRequestedv, lastRequesteda, last_quality, rebuffer, currentPlayerIdx, url);

        // console.log("QUALITY RETURNED IS: " + quality);

        // const activeRules = getActiveRules(switchRequestArray);

        // const maxQuality = getMinSwitchRequest(activeRules);

        // return maxQuality || SwitchRequest(context).create();

        return SwitchRequest(context).create(quality) // get the quality from python server.
    }

    function shouldAbandonFragment(rulesContext) {
        const abandonRequestArray = abandonFragmentRules.map(rule => rule.shouldAbandon(rulesContext));
        const activeRules = getActiveRules(abandonRequestArray);
        const shouldAbandon = getMinSwitchRequest(activeRules);

        return shouldAbandon || SwitchRequest(context).create();
    }

    function reset() {
        [qualitySwitchRules, abandonFragmentRules].forEach(rules => {
            if (rules && rules.length) {
                rules.forEach(rule => rule.reset && rule.reset());
            }
        });
        qualitySwitchRules = [];
        abandonFragmentRules = [];
    }

    instance = {
        initialize: initialize,
        reset: reset,
        getMaxQuality: getMaxQuality,
        shouldAbandonFragment: shouldAbandonFragment
    };

    return instance;
}

ABRRulesCollection.__dashjs_factory_name = 'ABRRulesCollection';
const factory = FactoryMaker.getClassFactory(ABRRulesCollection);
factory.QUALITY_SWITCH_RULES = QUALITY_SWITCH_RULES;
factory.ABANDON_FRAGMENT_RULES = ABANDON_FRAGMENT_RULES;
FactoryMaker.updateSingletonFactory(ABRRulesCollection.__dashjs_factory_name, factory);

export default factory;
