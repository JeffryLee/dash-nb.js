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
import cea608parser from '../../externals/cea608-parser';
import Constants from './constants/Constants';
import DashConstants from '../dash/constants/DashConstants';
import MetricsConstants from './constants/MetricsConstants';
import PlaybackController from './controllers/PlaybackController';
import StreamController from './controllers/StreamController';
import GapController from './controllers/GapController';
import MediaController from './controllers/MediaController';
import BaseURLController from './controllers/BaseURLController';
import ManifestLoader from './ManifestLoader';
import ErrorHandler from './utils/ErrorHandler';
import Capabilities from './utils/Capabilities';
import TextTracks from './text/TextTracks';
import RequestModifier from './utils/RequestModifier';
import TextController from './text/TextController';
import URIFragmentModel from './models/URIFragmentModel';
import ManifestModel from './models/ManifestModel';
import MediaPlayerModel from './models/MediaPlayerModel';
import AbrController from './controllers/AbrController';
import SchemeLoaderFactory from './net/SchemeLoaderFactory';
import VideoModel from './models/VideoModel';
import CmcdModel from './models/CmcdModel';
import DOMStorage from './utils/DOMStorage';
import Debug from './../core/Debug';
import Errors from './../core/errors/Errors';
import EventBus from './../core/EventBus';
import Events from './../core/events/Events';
import MediaPlayerEvents from './MediaPlayerEvents';
import FactoryMaker from '../core/FactoryMaker';
import Settings from '../core/Settings';
import {
    getVersionString
}
from './../core/Version';

//Dash
import SegmentBaseController from '../dash/controllers/SegmentBaseController';
import DashAdapter from '../dash/DashAdapter';
import DashMetrics from '../dash/DashMetrics';
import TimelineConverter from '../dash/utils/TimelineConverter';
import {
    HTTPRequest
} from './vo/metrics/HTTPRequest';
import BASE64 from '../../externals/base64';
import ISOBoxer from 'codem-isoboxer';
import DashJSError from './vo/DashJSError';
import { checkParameterType } from './utils/SupervisorTools';
import ManifestUpdater from './ManifestUpdater';
import URLUtils from '../streaming/utils/URLUtils';
import BoxParser from './utils/BoxParser';
import MediaPlayer from './MediaPlayer';

/**
 * @module SuperPlayer
 * @description The SuperPlayer is the primary dash.js Module and a Facade to build your player around.
 * It will allow you access to all the important dash.js properties/methods via the public API and all the
 * events to build a robust DASH media player.
 */
function SuperPlayer() {

    const context = this.context;

    const queueLength = 8;

    let instance,
        players,
        playerview,
        player1,
        player2,
        urls,
        // the index to the video that current playing
        playIdx,
        // the index to the video that next buffering
        loadIdx;

    /*
    ---------------------------------------------------------------------------

        INIT FUNCTIONS

    ---------------------------------------------------------------------------
    */
    function setup() {
        playIdx = 0;
        loadIdx = 0;
        players = []

        for (var i = 0; i < queueLength; i++) {
            players.push(MediaPlayer().create());
            players[i].initialize(null, null, true);
        }
    }

    // players[i].initialize(null, urls[i], true);

    function attachSource(source) {
        var ret = pushToQueue(source);
        return ret;
    }

    function pushToQueue(source) {
        var idx = (loadIdx + 1) % queueLength;

        if (idx == playIdx) {
            return -1;
        }

        // need to check whether the player is initialized;

        // players[loadIdx].initialize(null, source, true);
        players[loadIdx].attachSource(source);
        players[loadIdx].preload();

        loadIdx = idx;

        return 0;
    }

    function attachView(view) {
        playerview = view;
    }

    function popFromQueue() {
        console.log('playIdx: '+playIdx);
        console.log('loadIdx: '+loadIdx);

        if (playIdx == loadIdx) {
            return -1;
        }
        
        players[playIdx].reset();

        playIdx = playIdx + 1;

        playIdx = playIdx % queueLength;

        return 0;
    }

    function playNext() {
        var ret = popFromQueue();
        if (ret == 0) {

            if (playIdx != loadIdx) {
                players[playIdx].attachView(playerview);
            }

            return ret;
        } else {
            return ret;
        }
    }

    function setConfig(config) {

    }

    function add() {
        idx = idx + 1;
    }

    function query() {
        return idx;
    }



    instance = {
        // initialize: initialize,
        setConfig: setConfig,
        add: add,
        query: query,
        attachSource: attachSource,
        attachView: attachView,
        playNext: playNext
    };

    setup();

    return instance;
}

SuperPlayer.__dashjs_factory_name = 'SuperPlayer';
const factory = FactoryMaker.getClassFactory(SuperPlayer);
// factory.events = SuperPlayerEvents;
// factory.errors = Errors;
FactoryMaker.updateClassFactory(SuperPlayer.__dashjs_factory_name, factory);

export default factory;


// XlinkLoader.__dashjs_factory_name = 'XlinkLoader';
// export default FactoryMaker.getClassFactory(XlinkLoader);
