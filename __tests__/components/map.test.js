/* global it, describe, expect, spyOn, afterEach */

import React from 'react';
import {shallow, mount, configure} from 'enzyme';
import nock from 'nock';
import Adapter from 'enzyme-adapter-react-16';

import olMap from 'ol/pluggablemap';
import olView from 'ol/view';
import TileLayer from 'ol/layer/tile';
import VectorLayer from 'ol/layer/vector';
import ImageLayer from 'ol/layer/image';
import VectorTileLayer from 'ol/layer/vectortile';
import VectorTileSource from 'ol/source/vectortile';
import ImageStaticSource from 'ol/source/imagestatic';
import TileJSONSource from 'ol/source/tilejson';
import TileWMSSource from 'ol/source/tilewms';
import XYZSource from 'ol/source/xyz';
import ImageTile from 'ol/imagetile';
import TileState from 'ol/tilestate';

import {createStore, combineReducers} from 'redux';
import {radiansToDegrees} from '../../src/util';

import ConnectedMap, {Map} from '../../src/components/map';
import {hydrateLayer, getFakeStyle, getMapExtent, getTileJSONUrl} from '../../src/components/map';
import SdkPopup from '../../src/components/map/popup';
import MapReducer from '../../src/reducers/map';
import MapInfoReducer from '../../src/reducers/mapinfo';
import PrintReducer from '../../src/reducers/print';
import * as MapActions from '../../src/actions/map';
import * as MapInfoActions from '../../src/actions/mapinfo';
import * as PrintActions from '../../src/actions/print';

configure({adapter: new Adapter()});

describe('Map component', () => {

  afterEach(() => {
    nock.cleanAll();
  });

  it('should render without throwing an error', () => {
    const wrapper = shallow(<Map />);
    expect(wrapper.find('.sdk-map').length).toBe(1);
  });

  it('should allow for custom className', () => {
    const wrapper = shallow(<Map className='foo' />);
    expect(wrapper.find('.foo').length).toBe(1);
  });

  it('should create a map', (done) => {

    // eslint-disable-next-line
    const response = {
      'maxzoom': 16,
      'minzoom': 4,
      'tiles': [
        'https://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7/{z}/{x}/{y}.vector.pbf?access_token=foo',
        'https://b.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7/{z}/{x}/{y}.vector.pbf?access_token=foo'
      ]
    };
    nock('https://api.mapbox.com')
      .get('/v4/mapbox.mapbox-streets-v7.json?access_token=foo')
      .reply(200, response);

    const sources = {
      osm: {
        type: 'raster',
        attribution: '&copy; <a href=\'https://www.openstreetmap.org/copyright\'>OpenStreetMap</a> contributors.',
        tileSize: 256,
        tiles: [
          'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
        ],
      },
      'states-wms': {
        type: 'raster',
        tileSize: 256,
        tiles: ['https://ahocevar.com/geoserver/gwc/service/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&FORMAT=image/png&SRS=EPSG:900913&LAYERS=topp:states&STYLES=&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}'],
      },
      points: {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [0, 0],
          },
          properties: {
            title: 'Null Island',
          },
        },
      },
      mvt: {
        type: 'vector',
        tiles: ['https://{a-d}.tiles.mapbox.com/v4/mapbox.mapbox-streets-v6/{z}/{x}/{y}.vector.pbf?access_token=test_key'],
      },
      mapbox: {
        url: 'mapbox://mapbox.mapbox-streets-v7',
        type: 'vector',
      },
      tile: {
        type: 'raster',
        tileSize: 256,
        tiles: ['https://www.example.com/foo?BBOX={bbox-epsg-3857}'],
      },
      tiletms: {
        type: 'raster',
        tileSize: 256,
        scheme: 'tms',
        tiles: ['http://www.example.com/tms/{z}/{x}/{y}.png'],
      },
      tilexyz: {
        type: 'raster',
        tileSize: 256,
        tiles: ['http://www.example.com/{z}/{x}/{y}.png'],
      },
    };
    const layers = [
      {
        id: 'osm',
        source: 'osm',
      }, {
        id: 'states',
        source: 'states-wms',
      }, {
        id: 'sample-points',
        source: 'points',
        type: 'circle',
        paint: {
          'circle-radius': 5,
          'circle-color': '#feb24c',
          'circle-stroke-color': '#f03b20',
        },
      }, {
        id: 'mvt-layer',
        source: 'mvt',
      }, {
        id: 'mapbox-layer',
        source: 'mapbox',
      }, {
        id: 'purple-points',
        ref: 'sample-points',
        paint: {
          'circle-radius': 5,
          'circle-color': '#cc00cc',
        },
        filter: ['==', 'isPurple', true],
      }, {
        id: 'tilelayer',
        source: 'tile',
      }, {
        id: 'tmslayer',
        source: 'tiletms',
      }, {
        id: 'xyzlayer',
        source: 'tilexyz',
      },
    ];
    const metadata = {
      'bnd:source-version': 0,
      'bnd:layer-version': 0,
    };

    const center = [0, 0];
    const zoom = 2;
    const apiKey = 'foo';
    const wrapper = mount(<Map
      mapbox={{accessToken: apiKey}}
      map={{center, zoom, sources, layers, metadata}}
    />);
    const map = wrapper.instance().map;
    expect(map).toBeDefined();
    expect(map).toBeInstanceOf(olMap);
    window.setTimeout(() => {
      expect(map.getLayers().item(0)).toBeInstanceOf(TileLayer);
      expect(map.getLayers().item(1)).toBeInstanceOf(TileLayer);
      expect(map.getLayers().item(1).getSource()).toBeInstanceOf(TileWMSSource);
      const tileLoadFunction = map.getLayers().item(6).getSource().getTileLoadFunction();
      const tileCoord = [0, 0, 0];
      const state = TileState.IDLE;
      const src = 'https://www.example.com/foo?BBOX={bbox-epsg-3857}';
      const tile = new ImageTile(tileCoord, state, src, null, tileLoadFunction);
      tileLoadFunction(tile, src);
      // bbox substituted
      expect(tile.getImage().src).toBe('https://www.example.com/foo?BBOX=-20037508.342789244,20037508.342789244,20037508.342789244,60112525.02836773');
      // REQUEST param cleared
      expect(map.getLayers().item(1).getSource().getParams().REQUEST).toBe(undefined);
      expect(map.getLayers().item(2)).toBeInstanceOf(VectorLayer);
      expect(map.getLayers().item(3)).toBeInstanceOf(VectorTileLayer);
      expect(map.getLayers().item(3).getZIndex()).toBe(3);
      const expected = `https://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7/{z}/{x}/{y}.vector.pbf?access_token=${apiKey}`;
      expect(map.getLayers().item(4).getSource().getUrls()[0]).toBe(expected);
      expect(map.getLayers().item(4).getSource().getUrls()[1]).toBe(expected.replace('a.', 'b.'));
      expect(map.getLayers().item(4).getMaxResolution()).toBe(4891.96981025128);
      let tileUrlFunction = map.getLayers().item(7).getSource().getTileUrlFunction();
      expect(tileUrlFunction(tileCoord)).toBe('http://www.example.com/tms/0/0/1.png');
      tileUrlFunction = map.getLayers().item(8).getSource().getTileUrlFunction();
      expect(tileUrlFunction(tileCoord)).toBe('http://www.example.com/0/0/-1.png');
      // move the map.
      wrapper.setProps({
        zoom: 4,
      });
      spyOn(map, 'setTarget');
      wrapper.unmount();
      expect(map.setTarget).toHaveBeenCalledWith(null);
      done();
    }, 200);
  });

  it('should ignore unknown types', () => {
    const sources = {
      overlay: {
        type: 'foo',
      },
    };
    const layers = [
      {
        id: 'overlay',
        source: 'overlay',
      },
    ];
    const center = [0, 0];
    const zoom = 2;
    const metadata = {
      'bnd:source-version': 0,
      'bnd:layer-version': 0,
    };
    const wrapper = mount(<Map map={{center, zoom, sources, layers, metadata}} />);
    const map = wrapper.instance().map;
    expect(map.getLayers().getLength()).toBe(0);
  });

  it('should create a static image', (done) => {
    const sources = {
      overlay: {
        type: 'image',
        url: 'https://www.mapbox.com/mapbox-gl-js/assets/radar.gif',
        coordinates: [
          [-80.425, 46.437],
          [-71.516, 46.437],
          [-71.516, 37.936],
          [-80.425, 37.936],
        ],
      },
    };
    const layers = [
      {
        id: 'overlay',
        source: 'overlay',
        type: 'raster',
        paint: {'raster-opacity': 0.85},
      },
    ];
    const center = [0, 0];
    const zoom = 2;
    const metadata = {
      'bnd:source-version': 0,
      'bnd:layer-version': 0,
    };
    const wrapper = mount(<Map map={{center, zoom, sources, layers, metadata}} />);
    const map = wrapper.instance().map;
    window.setTimeout(() => {
      const layer = map.getLayers().item(0);
      expect(layer).toBeInstanceOf(ImageLayer);
      expect(layer.getOpacity()).toEqual(layers[0].paint['raster-opacity']);
      const source = layer.getSource();
      expect(source).toBeInstanceOf(ImageStaticSource);
      done();
    }, 0);
  });

  it('should create mvt groups', (done) => {
    // eslint-disable-next-line
    const response = {
      'maxzoom': 16,
      'minzoom': 0,
      'tiles': [
        'https://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7/{z}/{x}/{y}.vector.pbf?access_token=foo',
        'https://b.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7/{z}/{x}/{y}.vector.pbf?access_token=foo'
      ]
    };
    nock('https://api.mapbox.com')
      .get('/v4/mapbox.mapbox-streets-v7.json?access_token=foo')
      .reply(200, response);

    const sources = {
      mapbox: {
        url: 'mapbox://mapbox.mapbox-streets-v7',
        type: 'vector',
      },
    };
    const layers = [
      {
        id: 'landuse_overlay_national_park',
        type: 'fill',
        source: 'mapbox',
        'source-layer': 'landuse_overlay',
        filter: [
          '==',
          'class',
          'national_park'
        ],
        'paint': {
          'fill-color': '#d8e8c8',
          'fill-opacity': 0.75
        },
      }, {
        id: 'landuse_park',
        type: 'fill',
        source: 'mapbox',
        'source-layer': 'landuse',
        filter: [
          '==',
          'class',
          'park'
        ],
        paint: {
          'fill-color': '#d8e8c8'
        },
      }, {
        layout: {
          'text-font': [
            'Open Sans Italic',
            'Arial Unicode MS Regular'
          ],
          'text-field': '{name_en}',
          'text-max-width': 5,
          'text-size': 12
        },
        filter: [
          '==',
          '$type',
          'Point'
        ],
        type: 'symbol',
        source: 'mapbox',
        id: 'water_label',
        paint: {
          'text-color': '#74aee9',
          'text-halo-width': 1.5,
          'text-halo-color': 'rgba(255,255,255,0.7)'
        },
        'source-layer': 'water_label'
      }
    ];
    const center = [0, 0];
    const zoom = 2;
    const metadata = {
      'bnd:source-version': 0,
      'bnd:layer-version': 0,
    };
    const apiKey = 'foo';
    const wrapper = mount(<Map mapbox={{accessToken: apiKey}} map={{center, zoom, sources, layers, metadata}} />);
    const instance = wrapper.instance();
    const map = instance.map;
    window.setTimeout(() => {
      expect(map.getLayers().getLength()).toBe(1); // 1 layer created
      const layer = map.getLayers().item(0);
      expect(layer).toBeInstanceOf(VectorTileLayer);
      const source = layer.getSource();
      expect(source).toBeInstanceOf(VectorTileSource);
      expect(layer.get('name')).toBe('mapbox-landuse_overlay_national_park,landuse_park,water_label');
      expect(instance.layers[layer.get('name')]).toBe(layer);
      spyOn(layer, 'setSource');
      instance.updateLayerSource('mapbox');
      expect(layer.setSource).toHaveBeenCalled();
      done();
    }, 200);
  });

  it('should create a raster tilejson', (done) => {
    const sources = {
      tilejson: {
        type: 'raster',
        url: 'https://api.tiles.mapbox.com/v3/mapbox.geography-class.json?secure',
      },
    };
    const layers = [{
      id: 'tilejson-layer',
      source: 'tilejson',
    }];

    const metadata = {
      'bnd:source-version': 0,
      'bnd:layer-version': 0,
    };
    const center = [0, 0];
    const zoom = 2;
    const wrapper = mount(<Map map={{center, zoom, sources, layers, metadata}} />);
    window.setTimeout(() => {
      const map = wrapper.instance().map;
      const layer = map.getLayers().item(0);
      expect(layer).toBeInstanceOf(TileLayer);
      const source = layer.getSource();
      expect(source).toBeInstanceOf(TileJSONSource);
      done();
    });
  });

  it('should handle visibility changes', (done) => {
    const sources = {
      tilejson: {
        type: 'raster',
        url: 'https://api.tiles.mapbox.com/v3/mapbox.geography-class.json?secure',
      },
    };
    const layers = [{
      id: 'tilejson-layer',
      source: 'tilejson',
    }];

    const metadata = {
      'bnd:source-version': 0,
      'bnd:layer-version': 0,
    };
    const center = [0, 0];
    const zoom = 2;
    const wrapper = mount(<Map map={{center, zoom, sources, layers, metadata}} />);

    window.setTimeout(() => {
      const instance = wrapper.instance();
      const map = instance.map;
      const layer = map.getLayers().item(0);
      expect(layer.getVisible()).toBe(true);
      const nextProps = {
        map: {
          center,
          zoom,
          metadata: {
            'bnd:source-version': 0,
            'bnd:layer-version': 1,
          },
          sources,
          layers: [{
            id: 'tilejson-layer',
            source: 'tilejson',
            layout: {
              visibility: 'none',
            },
          }],
        },
      };
      instance.shouldComponentUpdate.call(instance, nextProps);
      window.setTimeout(() => {
        expect(layer.getVisible()).toBe(false);
        done();
      }, 0);
    }, 0);
  });

  it('should handle undefined center, zoom and bearing in constructor', () => {
    const sources = {
      tilejson: {
        type: 'raster',
        url: 'https://api.tiles.mapbox.com/v3/mapbox.geography-class.json?secure',
      },
    };
    const layers = [{
      id: 'tilejson-layer',
      source: 'tilejson',
    }];

    const metadata = {
      'bnd:source-version': 0,
      'bnd:layer-version': 0,
    };
    const wrapper = mount(<Map map={{sources, layers, metadata}} />);

    const instance = wrapper.instance();
    const map = instance.map;
    const view = map.getView();
    // default values should get set
    expect(view.getRotation()).toBe(0);
    expect(view.getCenter()).toBe(null);
    expect(view.getZoom()).toBe(undefined);
  });

  it('should handle undefined center, zoom, bearing in shouldComponentUpdate', () => {
    const sources = {
      tilejson: {
        type: 'raster',
        url: 'https://api.tiles.mapbox.com/v3/mapbox.geography-class.json?secure',
      },
    };
    const layers = [{
      id: 'tilejson-layer',
      source: 'tilejson',
    }];

    const metadata = {
      'bnd:source-version': 0,
      'bnd:layer-version': 0,
    };
    const center = [0, 0];
    const zoom = 2;
    const bearing = 45;
    const wrapper = mount(<Map map={{bearing, center, zoom, sources, layers, metadata}} />);

    const instance = wrapper.instance();
    const map = instance.map;
    const view = map.getView();
    // center in EPSG:4326
    const centerWGS84 = view.getCenter();

    const nextProps = {
      map: {
        center: undefined,
        zoom: undefined,
        bearing: undefined,
        metadata: {
          'bnd:source-version': 0,
          'bnd:layer-version': 0,
        },
        sources,
        layers,
      },
    };
    instance.shouldComponentUpdate.call(instance, nextProps);
    // previous values should still be valid
    expect(radiansToDegrees(view.getRotation())).toBe(-45);
    expect(view.getZoom()).toBe(2 + 1);
    expect(view.getCenter()).toBe(centerWGS84);
  });

  it('should handle layout changes', (done) => {
    const sources = {
      geojson: {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [0, 0],
          },
          properties: {
            layer: 'symbol-layer',
          },
        },
      },
    };
    const layers = [{
      id: 'symbol-layer',
      source: 'geojson',
      'source-layer': 'symbol-layer',
      type: 'symbol',
      layout: {
        'icon-image': 'foo',
      },
    }];
    const metadata = {
      'bnd:source-version': 0,
      'bnd:layer-version': 0,
    };
    const center = [0, 0];
    const zoom = 2;
    const wrapper = mount(<Map map={{center, zoom, sources, layers, metadata}} />);
    const instance = wrapper.instance();

    window.setTimeout(() => {
      const map = instance.map;
      const layer = map.getLayers().item(0);
      const ol_style = layer.getStyle();

      // test that the style has been set to something
      expect(typeof ol_style).toEqual('function');
      done();
    }, 0);
  });

  it('handles updates to geojson source', (done) => {
    const sources = {
      drone: {
        type: 'geojson',
        data: 'https://wanderdrone.appspot.com/',
      },
    };
    const layers = [{
      id: 'drone',
      source: 'drone',
    }];
    const metadata = {
      'bnd:source-version': 0,
      'bnd:layer-version': 0,
    };
    const center = [0, 0];
    const zoom = 2;
    const wrapper = mount(<Map map={{center, zoom, sources, layers, metadata}} />);

    const instance = wrapper.instance();

    let nextProps = {
      map: {
        center,
        zoom,
        metadata: {
          'bnd:source-version': 1,
          'bnd:layer-version': 1,
          'bnd:data-version:drone': 1
        },
        sources: {
          drone: {
            type: 'geojson',
            data: 'https://wanderdrone.appspot.com/',
          },
        },
        layers: [{
          id: 'drone',
          source: 'drone',
        }],
      },
    };
    let error = false;
    window.setTimeout(() => {
      try {
        instance.shouldComponentUpdate.call(instance, nextProps);
      } catch (e) {
        error = true;
      }
      expect(error).toBe(false);
      done();
    }, 0);
  });

  it('handles updates to source and layer min/maxzoom values', (done) => {
    const sources = {
      tilejson: {
        type: 'raster',
        url: 'https://api.mapbox.com/v3/mapbox.geography-class.json?secure',
      },
    };
    const layers = [{
      id: 'tilejson-layer',
      source: 'tilejson',
      minzoom: 2,
      maxzoom: 5,
    }];
    const metadata = {
      'bnd:source-version': 0,
      'bnd:layer-version': 0,
    };
    const center = [0, 0];
    const zoom = 2;
    const wrapper = mount(<Map map={{center, zoom, sources, layers, metadata}} />);

    window.setTimeout(() => {
      const instance = wrapper.instance();
      const map = instance.map;
      const view = map.getView();
      const layer = map.getLayers().item(0);

      // min/max zoom values defined on source only
      let nextProps = {
        map: {
          center,
          zoom,
          metadata: {
            'bnd:source-version': 1,
            'bnd:layer-version': 2,
          },
          sources: {
            tilejson: {
              type: 'raster',
              url: 'https://api.tiles.mapbox.com/v3/mapbox.geography-class.json?secure',
              minzoom: 4,
              maxzoom: 8,
            },
          },
          layers: [{
            id: 'tilejson-layer',
            source: 'tilejson',
          }],
        },
      };
      instance.shouldComponentUpdate.call(instance, nextProps);
      window.setTimeout(() => {
        let max_rez = view.constrainResolution(
          view.getMaxResolution(), nextProps.map.sources.tilejson.maxzoom - view.getMinZoom());
        expect(layer.getMaxResolution()).toEqual(max_rez);
        let min_rez = view.constrainResolution(
          view.getMaxResolution(), nextProps.map.sources.tilejson.minzoom - view.getMinZoom());
        expect(layer.getMinResolution()).toEqual(min_rez);

        // min.max zoom values defined on both source and layer def
        nextProps = {
          map: {
            center,
            zoom,
            metadata: {
              'bnd:source-version': 2,
              'bnd:layer-version': 3,
            },
            sources: {
              tilejson: {
                type: 'raster',
                url: 'https://api.tiles.mapbox.com/v3/mapbox.geography-class.json?secure',
                minzoom: 1,
                maxzoom: 7,
              },
            },
            layers: [{
              id: 'tilejson-layer',
              source: 'tilejson',
              minzoom: 2,
              maxzoom: 9,
            }],
          },
        };
        instance.shouldComponentUpdate.call(instance, nextProps);
        window.setTimeout(() => {
          // the layer minzoom will be handled in the style and *not* on the layer itself.
          max_rez = view.constrainResolution(
            view.getMaxResolution(), nextProps.map.sources.tilejson.maxzoom - view.getMinZoom());
          expect(layer.getMaxResolution()).toEqual(max_rez);
          min_rez = view.constrainResolution(
            view.getMinResolution(), nextProps.map.sources.tilejson.minzoom - view.getMaxZoom());
          expect(layer.getMinResolution()).toEqual(min_rez);
          done();
        }, 0);
      }, 0);
    }, 0);
  });

  it('should handle layer removal and re-adding', (done) => {
    const sources = {
      tilejson: {
        type: 'raster',
        url: 'https://api.tiles.mapbox.com/v3/mapbox.geography-class.json?secure',
      },
    };
    const layers = [{
      id: 'tilejson-layer',
      source: 'tilejson',
    }];
    const center = [0, 0];
    const zoom = 2;
    const metadata = {
      'bnd:source-version': 0,
      'bnd:layer-version': 0,
    };
    const wrapper = mount(<Map map={{center, zoom, sources, layers, metadata}} />);
    window.setTimeout(() => {
      const instance = wrapper.instance();
      const map = instance.map;
      expect(map.getLayers().item(0)).not.toBe(undefined);
      let nextProps = {
        map: {
          center,
          zoom,
          metadata: {
            'bnd:source-version': 0,
            'bnd:layer-version': 1,
          },
          sources,
          layers: [],
        },
      };
      instance.shouldComponentUpdate.call(instance, nextProps);
      window.setTimeout(() => {
        expect(map.getLayers().getLength()).toBe(0);
        nextProps = {
          map: {
            center,
            zoom,
            metadata: {
              'bnd:source-version': 0,
              'bnd:layer-version': 2,
            },
            sources,
            layers,
          },
        };
        instance.shouldComponentUpdate.call(instance, nextProps);
        window.setTimeout(() => {
          expect(map.getLayers().getLength()).toBe(1);
          done();
        }, 0);
      }, 0);
    }, 0);
  });

  it('removes sources version definition when excluded from map spec', (done) => {
    const sources = {
      tilejson: {
        type: 'raster',
        url: 'https://api.tiles.mapbox.com/v3/mapbox.geography-class.json?secure',
      },
    };
    const layers = [{
      id: 'tilejson-layer',
      source: 'tilejson',
    }];
    const center = [0, 0];
    const zoom = 2;
    const metadata = {
      'bnd:source-version': 0,
      'bnd:layer-version': 0,
    };
    const wrapper = mount(<Map map={{sources, layers, center, zoom, metadata}} />);
    const instance = wrapper.instance();
    window.setTimeout(() => {
      expect(instance.sourcesVersion).toEqual(0);
      const nextProps = {
        map: {
          center,
          zoom,
          sources,
          layers: [],
        },
      };
      instance.shouldComponentUpdate.call(instance, nextProps);
      window.setTimeout(() => {
        expect(instance.sourcesVersion).toEqual(undefined);
        done();
      }, 0);
    }, 0);
  });

  it('should create a connected map', () => {
    const store = createStore(combineReducers({
      map: MapReducer,
    }));
    mount(<ConnectedMap store={store} />);
  });

  it('should set the map size', () => {
    const store = createStore(combineReducers({
      map: MapReducer,
      mapinfo: MapInfoReducer,
    }));
    const wrapper = mount(<ConnectedMap store={store} />);
    const sdk_map = wrapper.instance().getWrappedInstance();
    sdk_map.map.getSize = function() {
      return [100, 200];
    };
    sdk_map.map.dispatchEvent({
      type: 'change:size',
    });
    expect(store.getState().mapinfo.size).toEqual([100, 200]);
  });

  it('should change layer visibility', (done) => {
    const store = createStore(combineReducers({
      map: MapReducer,
    }));

    const wrapper = mount(<ConnectedMap store={store} />);
    const sdk_map = wrapper.instance().getWrappedInstance();

    store.dispatch(MapActions.addOsmSource('foo'));
    store.dispatch(MapActions.addLayer({
      id: 'foo',
      source: 'foo',
    }));

    let layer;
    window.setTimeout(function() {
      layer = sdk_map.map.getLayers().item(0);
      expect(layer.getVisible()).toBe(true);
      store.dispatch(MapActions.setLayerVisibility('foo', 'none'));
      window.setTimeout(function() {
        layer = sdk_map.map.getLayers().item(0);
        expect(layer.getVisible()).toBe(false);
        done();
      }, 0);
    }, 0);
  });

  it('should trigger the setView callback', () => {
    const store = createStore(combineReducers({
      map: MapReducer,
    }));

    const wrapper = mount(<ConnectedMap store={store} />);
    const sdk_map = wrapper.instance().getWrappedInstance();

    store.dispatch(MapActions.setView([-45, -45], 11));

    sdk_map.map.getView().setCenter([0, 0]);
    sdk_map.map.dispatchEvent({
      type: 'moveend',
    });

    expect(store.getState().map.center).toEqual([0, 0]);
  });

  it('should trigger the setMousePosition callback', () => {
    const store = createStore(combineReducers({
      map: MapReducer,
      mapinfo: MapInfoReducer,
    }));

    const props = {
      store,
    };
    const wrapper = mount(<ConnectedMap {...props} />);
    const sdk_map = wrapper.instance().getWrappedInstance();

    sdk_map.map.getSize = function() {
      return [100, 200];
    };

    sdk_map.map.dispatchEvent({
      type: 'pointermove',
      coordinate: [0, 0],
    });

    expect(store.getState().mapinfo.mouseposition.lngLat).toEqual({lng: 0, lat: 0});
  });

  it('should trigger updateSize', () => {
    const store = createStore(combineReducers({
      map: MapReducer,
      mapinfo: MapInfoReducer,
    }));

    const props = {
      store,
    };
    const wrapper = mount(<ConnectedMap {...props} />);
    const sdk_map = wrapper.instance().getWrappedInstance();

    sdk_map.map.getSize = function() {
      return [100, 200];
    };

    spyOn(sdk_map.map, 'updateSize');
    store.dispatch(MapInfoActions.setMapSize([200, 200]));
    expect(sdk_map.map.updateSize).toHaveBeenCalled();
  });

  it('should update the source url', (done) => {
    const store = createStore(combineReducers({
      map: MapReducer,
    }));
    const getMapUrl = 'https://demo.boundlessgeo.com/geoserver/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=TRUE&SRS=EPSG:900913&LAYERS=foo&STYLES=&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}';
    store.dispatch(MapActions.addSource('foo', {
      type: 'raster',
      tileSize: 256,
      tiles: [getMapUrl],
    }));
    store.dispatch(MapActions.addLayer({
      id: 'foo',
      source: 'foo',
    }));

    const wrapper = mount(<ConnectedMap store={store} />);
    const sdk_map = wrapper.instance().getWrappedInstance();
    window.setTimeout(() => {
      let source = sdk_map.sources['foo'];
      expect(source.getParams()['SALT']).toBeUndefined();
      store.dispatch(MapActions.updateSource('foo', {
        type: 'raster',
        tileSize: 256,
        tiles: [getMapUrl + '&SALT=0.556643'],
      }));
      window.setTimeout(() => {
        source = sdk_map.sources['foo'];
        expect(source.getParams()['SALT']).toEqual('0.556643');
        done();
      }, 0);
    }, 0);
  });

  it('should trigger the setRotation callback', () => {
    const store = createStore(combineReducers({
      map: MapReducer,
    }));

    const wrapper = mount(<ConnectedMap store={store} />);
    const sdk_map = wrapper.instance().getWrappedInstance();

    store.dispatch(MapActions.setBearing(20));
    expect(store.getState().map.bearing).toEqual(20);

    sdk_map.map.getView().setRotation(-5);
    sdk_map.map.dispatchEvent({
      type: 'moveend',
    });

    expect(store.getState().map.bearing).toEqual(radiansToDegrees(5));
  });

  it('should trigger renderSync on export image', () => {
    const store = createStore(combineReducers({
      map: MapReducer,
      print: PrintReducer,
    }));
    const props = {
      store,
    };

    const wrapper = mount(<ConnectedMap {...props} />);
    const sdk_map = wrapper.instance().getWrappedInstance();
    spyOn(sdk_map.map, 'renderSync');
    store.dispatch(PrintActions.exportMapImage());

    // renderSync should get called.
    expect(sdk_map.map.renderSync).toHaveBeenCalled();
  });

  it('should trigger the popup-related callbacks', () => {
    const store = createStore(combineReducers({
      map: MapReducer,
    }));
    const onClick = (map, xy, featuresPromise) => {
      // check that something looking like a promise
      // was returned.
      expect(typeof featuresPromise.then).toBe('function');
    };

    // create a props dictionary which
    //  can include a spy.
    const props = {
      store,
      onClick,
      includeFeaturesOnClick: true,
    };
    spyOn(props, 'onClick');

    const wrapper = mount(<ConnectedMap {...props} />);
    const sdk_map = wrapper.instance().getWrappedInstance();
    spyOn(sdk_map.map, 'forEachFeatureAtPixel');
    sdk_map.map.dispatchEvent({
      type: 'postcompose',
    });

    sdk_map.map.dispatchEvent({
      type: 'singleclick',
      coordinate: [0, 0],
      // this fakes the clicking of the canvas.
      originalEvent: {
        // eslint-disable-next-line no-underscore-dangle
        target: sdk_map.map.getRenderer().canvas_,
      },
    });

    // onclick should get called when the map is clicked.
    expect(props.onClick).toHaveBeenCalled();

    // forEachFeatureAtPixel should get called when includeFeaturesOnClick is true
    expect(sdk_map.map.forEachFeatureAtPixel).toHaveBeenCalled();
  });

  it('should create an overlay for the initialPopups', () => {
    const store = createStore(combineReducers({
      map: MapReducer,
    }));

    const props = {
      store,
      initialPopups: [(<SdkPopup coordinate={[0, 0]}><div>foo</div></SdkPopup>)],
    };


    const wrapper = mount(<ConnectedMap {...props} />);
    const sdk_map = wrapper.instance().getWrappedInstance();

    expect(sdk_map.map.getOverlays().getLength()).toEqual(0);

    sdk_map.map.dispatchEvent({
      type: 'postcompose',
    });

    expect(sdk_map.map.getOverlays().getLength()).toEqual(1);
  });

  it('should add a popup', () => {
    const store = createStore(combineReducers({
      map: MapReducer,
    }));

    const props = {
      store,
    };

    const wrapper = mount(<ConnectedMap {...props} />);
    const sdk_map = wrapper.instance().getWrappedInstance();

    expect(sdk_map.map.getOverlays().getLength()).toEqual(0);

    spyOn(sdk_map, 'updatePopups');
    sdk_map.addPopup(<SdkPopup coordinate={[0, 0]}><div>foo</div></SdkPopup>, false);
    expect(sdk_map.map.getOverlays().getLength()).toEqual(1);
    expect(sdk_map.updatePopups).toHaveBeenCalled();
  });

  it('should remove a popup', () => {
    const store = createStore(combineReducers({
      map: MapReducer,
    }));

    const props = {
      store,
    };

    const wrapper = mount(<ConnectedMap {...props} />);
    const sdk_map = wrapper.instance().getWrappedInstance();

    sdk_map.addPopup(<SdkPopup coordinate={[0, 0]}><div>foo</div></SdkPopup>, false);
    spyOn(sdk_map, 'updatePopups');
    const id = sdk_map.map.getOverlays().item(0).get('popupId');
    sdk_map.removePopup(id);
    expect(sdk_map.updatePopups).toHaveBeenCalled();
  });

  it('should remove the overlay of the popup', () => {
    const store = createStore(combineReducers({
      map: MapReducer,
    }));

    const props = {
      store,
    };

    const wrapper = mount(<ConnectedMap {...props} />);
    const sdk_map = wrapper.instance().getWrappedInstance();

    sdk_map.addPopup(<SdkPopup coordinate={[0, 0]}><div>foo</div></SdkPopup>, false);
    const id = sdk_map.map.getOverlays().item(0).get('popupId');
    sdk_map.popups[id].state.closed = true;
    sdk_map.updatePopups();
    expect(sdk_map.map.getOverlays().getLength()).toEqual(0);
  });

  it('should handle Mapbox substitution in TileJSON', () => {
    const apiKey = 'foo';
    const glSource = {
      type: 'raster',
      tileSize: 256,
      url: 'mapbox://mapbox.satellite',
    };
    const url = getTileJSONUrl(glSource, apiKey);
    expect(url).toEqual('https://api.mapbox.com/v4/mapbox.satellite.json?access_token=foo');
  });

  it('should handle getFakeStyle', () => {
    const sprite = 'mapbox://foo';
    const baseUrl = 'http://example.com';
    const accessToken = 'mytoken';
    const layers = [{id: 'foo'}];
    const style = getFakeStyle(sprite, layers, baseUrl, accessToken);
    expect(style.sprite).toEqual(`${baseUrl}/sprite?access_token=${accessToken}`);
  });

  it('getMapExtent should work correctly', () => {
    const view = new olView({center: [0, 0], resolution: 1000});
    const extent = getMapExtent(view, [500, 250]);
    expect(extent).toEqual([-2.2457882102988034, -1.1228222300941866, 2.2457882102988034, 1.1228222300942008]);
  });

  it('should handle hydrateLayer', () => {
    const layer1 = {
      id: 'layer1',
      type: 'fill',
      source: 'foo',
      paint: {
        'fill-color': '#FF0000'
      }
    };
    const layer2 = {
      id: 'layer2',
      paint: {
        'fill-color': '#0000FF'
      },
      ref: 'layer1'
    };
    const layer = hydrateLayer([layer1, layer2], layer2);
    expect(layer.id).toBe('layer2');
    expect(layer.ref).toBe(undefined);
    expect(layer.paint['fill-color']).toBe('#0000FF');
    expect(layer.source).toBe('foo');
  });

  it('should call handleAsyncGetFeatureInfo', () => {
    const store = createStore(combineReducers({
      map: MapReducer,
    }));

    const props = {
      store,
      includeFeaturesOnClick: true,
    };

    store.dispatch(MapActions.addSource('osm', {
      type: 'raster',
      tileSize: 256,
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
    }));

    store.dispatch(MapActions.addLayer({
      id: 'osm',
      source: 'osm',
    }));

    const wrapper = mount(<ConnectedMap {...props} />);
    const sdk_map = wrapper.instance().getWrappedInstance();

    spyOn(sdk_map, 'handleAsyncGetFeatureInfo');

    sdk_map.queryMap({
      pixel: [0, 0],
    });

    expect(sdk_map.handleAsyncGetFeatureInfo).toHaveBeenCalled();
  });

  // removed set spriteData tests as they are now handled in ol-mapbox-style

  it('should handle WMS GetFeatureInfo', (done) => {
    const store = createStore(combineReducers({
      map: MapReducer,
    }));

    const props = {
      store,
      includeFeaturesOnClick: true,
    };

    const wrapper = mount(<ConnectedMap {...props} />);
    const sdk_map = wrapper.instance().getWrappedInstance();
    let promises = [];
    const layer = {
      id: 'foo',
      source: 'mywms',
      metadata: {
        'bnd:queryable': true,
      },
    };
    // eslint-disable-next-line
    const response = {"type":"FeatureCollection","totalFeatures":"unknown","features":[{"type":"Feature","id":"bugsites.1","geometry":{"type":"Point","coordinates":[590232,4915039]},"geometry_name":"the_geom","properties":{"cat":1,"str1":"Beetle site"}}],"crs":{"type":"name","properties":{"name":"urn:ogc:def:crs:EPSG::26713"}}};
    nock('http://example.com')
      .get('/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&FORMAT=image%2Fpng&TRANSPARENT=true&QUERY_LAYERS=bar&LAYERS=bar&INFO_FORMAT=application%2Fjson&I=0&J=255&WIDTH=256&HEIGHT=256&CRS=EPSG%3A3857&STYLES=&BBOX=0%2C0%2C2504688.5428486555%2C2504688.5428486555')
      .reply(200, response);

    sdk_map.sources = {
      mywms: new TileWMSSource({url: 'http://example.com/wms', params: {LAYERS: 'bar'}}),
    };
    // invisible layer ignored
    layer.layout = {visibility: 'none'};
    sdk_map.handleAsyncGetFeatureInfo(layer, promises, {coordinate: [100, 100]});
    expect(promises.length).toEqual(0);
    delete layer.layout;
    promises = [];
    // non queryable layer ignored
    layer.metadata['bnd:queryable'] = false;
    sdk_map.handleAsyncGetFeatureInfo(layer, promises, {coordinate: [100, 100]});
    expect(promises.length).toEqual(0);
    promises = [];
    layer.metadata['bnd:queryable'] = true;
    delete layer.layout;
    sdk_map.handleAsyncGetFeatureInfo(layer, promises, {coordinate: [100, 100]});
    expect(promises.length).toEqual(1);
    promises[0].then(function(features) {
      expect(features[layer.id][0].id).toBe('bugsites.1');
      done();
    });
  });

  it('should handle Esri GetFeatureInfo', (done) => {
    const store = createStore(combineReducers({
      map: MapReducer,
    }));

    store.dispatch(MapActions.setView([-45, -45], 11));

    const props = {
      store,
      includeFeaturesOnClick: true,
    };

    const wrapper = mount(<ConnectedMap {...props} />);
    const sdk_map = wrapper.instance().getWrappedInstance();
    sdk_map.map.getSize = function() {
      return [300, 300];
    };
    let promises = [];
    const layer = {
      id: 'foo',
      source: 'mywms',
      metadata: {
        'bnd:queryable': true,
        'bnd:query-endpoint': 'http://example.com/identify',
      },
    };
    // eslint-disable-next-line
    const response = {"results":[{"layerId":0,"layerName":"ushigh","value":"Multi-Lane Divided","displayFieldName":"TYPE","attributes":{"OBJECTID":"281","Shape":"Polyline","LENGTH":"124.679","TYPE":"Multi-Lane Divided","ADMN_CLASS":"Interstate","TOLL_RD":"N","RTE_NUM1":"40","RTE_NUM2":"","ROUTE":"Interstate  40","Shape_Length":"2.182181"},"geometryType":"esriGeometryPolyline","geometry":{"spatialReference":{"wkid":102100},"paths":[[[-10035026.9794618,4184192.41321696],[-10039863.8602667,4186507.90771703],[-10058344.2892869,4186795.13931307],[-10074044.8971256,4184729.85084201],[-10082837.9850594,4181792.17764161],[-10105638.1582591,4170327.73329184],[-10115868.3014353,4163464.98998342],[-10151614.7252565,4150862.14745806],[-10170743.9186755,4143051.31641744],[-10180703.8491623,4142175.78372325],[-10191369.5562355,4139428.17898129],[-10195548.1904265,4139522.78885466],[-10204280.8569411,4139699.59211255],[-10208725.3136425,4137812.17764192],[-10220539.3534125,4136610.72980474],[-10228992.6842444,4137340.89255395],[-10244114.0546956,4137190.34705713],[-10266751.9523214,4134360.96965315],[-10270636.7763633,4133810.88555451]]]}}]};
    nock('http://example.com')
      .get('/identify?geometryType=esriGeometryPoint&geometry=100%2C100&sr=3857&tolerance=2&mapExtent=-5015109.862818699%2C-5627254.2633134555%2C-5003644.308575923%2C-5615788.709070679&imageDisplay=300%2C300%2C90&f=json&pretty=false')
      .reply(200, response);

    sdk_map.sources = {
      mywms: new XYZSource({urls: ['http://example.com/export?F=image&FORMAT=PNG32&TRANSPARENT=true&SIZE=256%2C256&BBOX={bbox-epsg-3857}&BBOXSR=3857&IMAGESR=3857&DPI=90']}),
    };
    sdk_map.handleAsyncGetFeatureInfo(layer, promises, {coordinate: [100, 100]});
    expect(promises.length).toEqual(1);
    promises[0].then(function(features) {
      expect(features[layer.id][0].properties.OBJECTID).toBe('281');
      done();
    });
  });

  it('should handle WFS GetFeatureInfo', (done) => {
    const store = createStore(combineReducers({
      map: MapReducer,
    }));

    store.dispatch(MapActions.setView([-45, -45], 11));

    const props = {
      store,
      includeFeaturesOnClick: true,
    };

    const wrapper = mount(<ConnectedMap {...props} />);
    const sdk_map = wrapper.instance().getWrappedInstance();
    sdk_map.map.getSize = function() {
      return [300, 300];
    };
    let promises = [];
    const layer = {
      id: 'foo',
      source: 'mywms',
      metadata: {
        'bnd:queryable': true,
        'bnd:query-endpoint': 'http://example.com/geoserver',
        'bnd:query-type': 'WFS',
        'bnd:geometry-name': 'wkb_geometry',
      },
    };
    // eslint-disable-next-line
    const response = {"type":"FeatureCollection","totalFeatures":1,"features":[{"type":"Feature","id":"ogrgeojson_92929c5c.48","geometry":{"type":"MultiPolygon","coordinates":[[[[-114.519844,33.027668],[-114.558304,33.036743],[-114.609138,33.026962],[-114.633179,33.033527],[-114.644371,33.044373],[-114.663162,33.038883],[-114.710564,33.095345],[-114.708672,33.122337],[-114.67733,33.167213],[-114.67926,33.22456],[-114.68692,33.239223],[-114.676903,33.267982],[-114.734634,33.305676],[-114.702812,33.352386],[-114.724144,33.41103],[-114.644302,33.419086],[-114.629784,33.439396],[-114.6203,33.468571],[-114.597298,33.486099],[-114.586273,33.509418],[-114.528633,33.560047],[-114.539459,33.580482],[-114.526382,33.622112],[-114.524475,33.665482],[-114.535645,33.682713],[-114.494888,33.708347],[-114.509499,33.743179],[-114.503769,33.771694],[-114.520332,33.826012],[-114.510933,33.841946],[-114.520172,33.862907],[-114.497398,33.925018],[-114.524841,33.952396],[-114.517418,33.965046],[-114.428192,34.029827],[-114.423241,34.078316],[-114.409378,34.102638],[-114.322014,34.141281],[-114.284584,34.171215],[-114.234993,34.186207],[-114.149132,34.266964],[-114.124451,34.272606],[-114.133347,34.314533],[-114.152634,34.336433],[-114.181297,34.365192],[-114.257057,34.405476],[-114.282608,34.412056],[-114.302078,34.435741],[-114.331848,34.454861],[-114.375717,34.459667],[-114.383072,34.477074],[-114.376038,34.536552],[-114.408951,34.583714],[-114.43351,34.598953],[-114.421478,34.610886],[-114.464844,34.709866],[-114.497009,34.744751],[-114.524757,34.748905],[-114.541245,34.759953],[-114.56942,34.831856],[-114.626465,34.87553],[-114.629677,34.919498],[-114.620209,34.943607],[-114.631477,34.99765],[-114.62027,34.998913],[-114.63298,35.041862],[-114.594833,35.076057],[-114.635109,35.118656],[-114.625641,35.133907],[-114.581818,35.132561],[-114.571457,35.140068],[-114.560242,35.174347],[-114.558784,35.220184],[-114.58709,35.304771],[-114.588783,35.358383],[-114.644592,35.450768],[-114.67141,35.515762],[-114.648987,35.546646],[-114.652328,35.584843],[-114.639061,35.611359],[-114.653259,35.646595],[-114.667679,35.65641],[-114.664284,35.693111],[-114.688011,35.732609],[-114.681931,35.764717],[-114.689056,35.847458],[-114.661652,35.870975],[-114.660789,35.880489],[-114.698463,35.911629],[-114.735397,35.987667],[-114.716858,36.036777],[-114.728149,36.058773],[-114.727333,36.085983],[-114.711945,36.105202],[-114.620796,36.141987],[-114.598122,36.138355],[-114.529762,36.155109],[-114.465805,36.124729],[-114.443138,36.121071],[-114.379997,36.151009],[-114.34343,36.137497],[-114.315292,36.111454],[-114.303055,36.087124],[-114.306786,36.062248],[-114.232674,36.018345],[-114.205971,36.017269],[-114.128227,36.041744],[-114.106979,36.121105],[-114.044312,36.193993],[-114.036598,36.216038],[-114.042915,36.841873],[-114.043137,36.996563],[-112.899216,36.996243],[-112.541763,36.998009],[-112.236511,36.995506],[-111.355453,37.00172],[-110.739372,37.002491],[-110.483398,37.003929],[-110.451546,36.991749],[-109.996399,36.992065],[-109.047821,36.996643],[-109.047195,35.996655],[-109.045998,34.954613],[-109.048012,34.59174],[-109.049721,33.783249],[-109.049904,33.205101],[-109.050728,32.77948],[-109.048882,32.441967],[-109.045006,31.343348],[-110.451942,31.337559],[-111.07132,31.335535],[-111.368866,31.431438],[-113.328377,32.04356],[-114.820969,32.487114],[-114.808601,32.615993],[-114.72126,32.72081],[-114.711906,32.734966],[-114.693253,32.741379],[-114.603157,32.726238],[-114.602737,32.73584],[-114.571175,32.737392],[-114.571426,32.748783],[-114.559967,32.74889],[-114.560799,32.760708],[-114.542221,32.760704],[-114.542404,32.771187],[-114.529312,32.771366],[-114.534294,32.788002],[-114.525436,32.809868],[-114.460655,32.845379],[-114.475662,32.935867],[-114.467606,32.977749],[-114.519844,33.027668]]]]},"geometry_name":"wkb_geometry","properties":{"id":"states.11","state_name":"Arizona","state_fips":"04","sub_region":"Mtn","state_abbr":"AZ","land_km":294333.462,"water_km":942.772,"persons":3665228,"families":940106,"houshold":1368843,"male":1810691,"female":1854537,"workers":1358263,"drvalone":1178320,"carpool":239083,"pubtrans":32856,"employed":1603896,"unemploy":123902,"service":455896,"manual":185109,"p_male":0.494,"p_female":0.506,"samp_pop":468178}}],"crs":{"type":"name","properties":{"name":"urn:ogc:def:crs:EPSG::4326"}}};
    nock('http://example.com')
      .get('/geoserver?request=GetFeature&version=1.0.0&typename=mywms&outputformat=JSON&srs=EPSG%3A4326&cql_filter=DWITHIN(wkb_geometry%2CPoint(0.0008983152841195214%200.0008983152840897901)%2C191.0925707129451%2Cmeters)')
      .reply(200, response);

    sdk_map.sources = {
      mywms: new XYZSource({urls: ['http://example.com/geoserver?foo=bar']}),
    };
    sdk_map.handleAsyncGetFeatureInfo(layer, promises, {coordinate: [100, 100]});
    expect(promises.length).toEqual(1);
    promises[0].then(function(features) {
      expect(features[layer.source][0].properties['samp_pop']).toBe(468178);
      done();
    });
  });

});
