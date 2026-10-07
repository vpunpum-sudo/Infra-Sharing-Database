import { Point } from '../types';
import L from 'leaflet';

export function useMapDrawing(
  drawingMode: 'none' | 'enclosure' | 'route' | 'edit-route' | 'loop' | 'edit-enclosure',
  onMapClick: (point: Point) => void,
  onEnclosureClick?: (enclosure: any) => void,
  onMarkerDragEnd?: (index: number, point: Point) => void,
  onMarkerClick?: (index: number) => void,
  onDraftRouteClick?: (point: Point) => void
) {
  const handleMapClick = (latlng: L.LatLng) => {
    onMapClick({ lat: latlng.lat, lng: latlng.lng });
  };

  const handleEnclosureClick = (enclosure: any, e: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(e);
    if (drawingMode === 'route' || drawingMode === 'edit-route') {
      onMapClick(enclosure.position);
    } else if (drawingMode === 'none' && onEnclosureClick) {
      onEnclosureClick(enclosure);
    }
  };

  const handleMarkerDragEnd = (index: number, e: L.DragEndEvent) => {
    if (onMarkerDragEnd && e.target && typeof e.target.getLatLng === 'function') {
      onMarkerDragEnd(index, { lat: e.target.getLatLng().lat, lng: e.target.getLatLng().lng });
    }
  };

  const handleMarkerClick = (index: number, e: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(e);
    if (onMarkerClick) onMarkerClick(index);
  };

  const handleDraftRouteClick = (e: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(e);
    if (onDraftRouteClick && (drawingMode === 'route' || drawingMode === 'edit-route')) {
      onDraftRouteClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    }
  };

  return {
    handleMapClick,
    handleEnclosureClick,
    handleMarkerDragEnd,
    handleMarkerClick,
    handleDraftRouteClick
  };
}
