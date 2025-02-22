from pyramid.view import view_config
from c2cgeoportal_commons.models import DBSession
from c2cgeoportal_commons.models.main import Theme as ThemeModel
from c2cgeoportal_geoportal.views.theme import Theme
from c2cgeoportal_geoportal.lib.caching import get_region, invalidate_region
from geoportailv3_geoportal.models import LuxLayerInternalWMS
from c2cgeoportal_commons import models
import logging

log = logging.getLogger(__name__)
cache_region = get_region("std")
invalidate_region()


# override c2cgeoportal Entry class to customize handling of WMS and WMTS time positions and prepare
# the theme tree for ngeo time functions
class LuxThemes(Theme):

    @view_config(route_name="themes", renderer="json")
    def themes(self):
        return super().themes()

    @view_config(route_name='isthemeprivate', renderer='json')
    def is_theme_private(self):
        theme = self.request.params.get('theme', '')

        cnt = DBSession.query(ThemeModel).filter(
            ThemeModel.public == False).filter(
            ThemeModel.name == theme).count()  # noqa

        if cnt == 1:
            return {'name': theme, 'is_private': True}

        return {'name': theme, 'is_private': False}

    def _wms_layers(self, ogc_server):
        if ogc_server.name == "Internal WMS":
            return self._wms_layers_internal()

        return super()._wms_layers(ogc_server)

    @cache_region.cache_on_arguments()
    def _wms_layers_internal(self):
        layers = {}
        for i, layer in enumerate(DBSession.query(LuxLayerInternalWMS)):
            for sublayer in layer.layers.split(",") if layer.layers is not None else []:
                layers[layer.name + '__' + sublayer] = {
                    "info": {
                        "name": layer.name + '__' + sublayer,
                    },
                    "children": []
                }

        return {"layers": layers}, set()

    def _fill_wms(self, layer_theme, layer, errors, mixed):
        if isinstance(layer, LuxLayerInternalWMS):
            layer_theme["imageType"] = layer.ogc_server.image_type
            if layer.style:  # pragma: no cover
                layer_theme["style"] = layer.style

            wms, wms_errors = self._wms_layers(layer.ogc_server)
            errors |= wms_errors
            if wms is None:
                return
            layer_theme["childLayers"] = []
            for layer_name in layer.layers.split(",") if layer.layers is not None else []:
                full_layer_name = layer.name + '__' + layer_name
                if full_layer_name in wms["layers"]:
                    wms_layer_obj = wms["layers"][full_layer_name]
                    if not wms_layer_obj["children"]:
                        layer_theme["childLayers"].append(wms["layers"][full_layer_name]["info"])
                    else:
                        for child_layer in wms_layer_obj["children"]:
                            layer_theme["childLayers"].append(wms["layers"][child_layer]["info"])
                else:
                    errors.add(
                        "The sublayer '{}' of internal layer {} is not defined in WMS capabilities".format(
                            layer_name, layer.name
                        )
                    )
        else:
            return super()._fill_wms(layer_theme, layer, errors, mixed)

    @view_config(route_name="lux_themes", renderer="json")
    def lux_themes(self):
        themes = super().themes()
        sets = self.request.params.get("set", "all")
        if sets in ("all", "3d"):
            themes["lux_3d"] = self.get_lux_3d_layers()
        return themes

    def get_lux_3d_layers(self):
        lux_3d_layers = {}
        interface = self.request.params.get("interface", "desktop")
        layers = self._layers(interface)
        try:
            terrain_layer = (models.DBSession.query(models.main.Layer)
                             .filter(models.main.Metadata.name == "ol3d_type",
                                     models.main.Metadata.value == "terrain",
                                     models.main.Layer.id == models.main.Metadata.item_id)).one()
            if terrain_layer.name in layers:
                if terrain_layer.url[-1] == "/":
                    lux_3d_layers["terrain_url"] = terrain_layer.url + terrain_layer.layer
                else:
                    lux_3d_layers["terrain_url"] = terrain_layer.url + "/" + terrain_layer.layer
        except:
            pass
        return lux_3d_layers

    @staticmethod
    def is_mixed(_):
        return True
