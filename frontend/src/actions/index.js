import axios from 'axios';
import Moment from 'moment';
import {
  MetricsBaseURL,
  S3Bucket,
  RoutesVersion,
  ArrivalsVersion,
  Agencies,
} from '../config';
import { MAX_DATE_RANGE } from '../UIConstants';

/**
 * Helper function to compute the list of days for the GraphQL query.
 *
 * @param dateRangeParams Current UI state.
 * @returns {Array} List of days to query for.
 */
function computeDates(dateRangeParams) {
  let endMoment = Moment(dateRangeParams.date);

  // If this is a custom date range, compute the number of days back
  // based on the start date.

  const startMoment = Moment(dateRangeParams.startDate);
  const deltaDays = endMoment.diff(startMoment, 'days');
  let numberOfDaysBack = Math.abs(deltaDays) + 1; // add one for the end date itself
  if (deltaDays < 0) {
    // if the start date is after end date, use the start date as the "end"
    endMoment = startMoment;
  }

  if (numberOfDaysBack > MAX_DATE_RANGE) {
    // guard rail
    numberOfDaysBack = MAX_DATE_RANGE;
  }

  // Generate the list of days, filtering by the days of the week checkboxes.

  const dates = [];
  for (let i = 0; i < numberOfDaysBack; i++) {
    if (dateRangeParams.daysOfTheWeek[startMoment.day()]) {
      dates.push(startMoment.format('YYYY-MM-DD'));
    }
    startMoment.add(1, 'days');
  }
  return dates;
}

// S3 URL to route configuration
export function generateRoutesURL(agencyId) {
  return `https://${S3Bucket}.s3.amazonaws.com/routes/${RoutesVersion}/routes_${RoutesVersion}_${agencyId}.json.gz?x`;
}

/**
 * Generate S3 url for arrivals
 * @param dateStr {string} date
 * @param routeId {string} route id
 * @returns {string} S3 url
 */
export function generateArrivalsURL(agencyId, dateStr, routeId) {
  return `https://${S3Bucket}.s3.amazonaws.com/arrivals/${ArrivalsVersion}/${agencyId}/${dateStr.replace(
    /-/g,
    '/',
  )}/arrivals_${ArrivalsVersion}_${agencyId}_${dateStr}_${routeId}.json.gz?aj`;
}

/**
 * The functions below here are Redux "thunks" (see https://github.com/reduxjs/redux-thunk),
 * a kind of Redux action that can do asynchronous processing.
 */

/**
 * Redux "thunk" that calls the GraphQL API and then processes the results.
 *
 * @param params {Object} The query parameters from Redux state.
 */
export function fetchTripMetrics(params) {
  const query = `
fragment intervalFields on TripIntervalMetrics {
      departures
      scheduledDepartures
      arrivals
      scheduledArrivals
      headways {
        count median max
        histogram { binStart binEnd count }
      }
      headwayScheduleDeltas {
          count
          histogram { binStart binEnd count }
      }
      scheduledHeadways {
        count median max
        histogram { binStart binEnd count }
      }
      tripTimes {
        count median max
        percentiles(percentiles:[90]) { percentile value }
        histogram { binStart binEnd count }
      }
      scheduledTripTimes {
        count median max
        percentiles(percentiles:[90]) { percentile value }
        histogram { binStart binEnd count }
      }
      waitTimes {
        median max
        percentiles(percentiles:[90]) { percentile value }
        histogram { binStart binEnd count }
      }
      scheduledWaitTimes {
        median max
        percentiles(percentiles:[90]) { percentile value }
        histogram { binStart binEnd count }
      }
      departureScheduleAdherence {
        onTimeCount
        scheduledCount
        closestDeltas {
          histogram(min:-5, max:15, binSize:1) { binStart binEnd count }
          count
        }
      }
      arrivalScheduleAdherence {
        onTimeCount
        scheduledCount
      }
}
fragment timeRangeFields on TripIntervalMetrics {
  startTime endTime
  waitTimes {
    percentiles(percentiles:[50,90]) { percentile value }
  }
  tripTimes {
    percentiles(percentiles:[50,90]) { percentile value }
  }
  scheduledWaitTimes {
    percentiles(percentiles:[50,90]) { percentile value }
  }
  scheduledTripTimes {
    percentiles(percentiles:[50,90]) { percentile value }
  }
  headways {
    median
  }
  scheduledHeadways {
    median
  }
  departureScheduleAdherence {
    onTimeCount
    scheduledCount
  }
  arrivalScheduleAdherence {
    onTimeCount
    scheduledCount
  }
}

query($agencyId:String!, $routeId:String!,
      $startStopId:String!, $endStopId:String, $directionId:String,
      $dates:[String!], $startTime:String, $endTime:String,
      $dates2:[String!], $startTime2:String, $endTime2:String,
      $includeByDay:Boolean!,
      $includeTimeRanges:Boolean!, $includeTimeRanges2:Boolean!,
      $dualDateRange:Boolean!) {
  agency(agencyId:$agencyId) {
    route(routeId:$routeId) {
      trip(startStopId:$startStopId, endStopId:$endStopId, directionId:$directionId) {
        interval(dates:$dates, startTime:$startTime, endTime:$endTime) {
          ...intervalFields
        }
        interval2: interval(dates:$dates2, startTime:$startTime2, endTime:$endTime2) @include(if: $dualDateRange) {
          ...intervalFields
        }
        timeRanges(dates:$dates) @include(if: $includeTimeRanges) {
          ...timeRangeFields
        }
        timeRanges2: timeRanges(dates:$dates2) @include(if: $includeTimeRanges2) {
          ...timeRangeFields
        }
        byDay(dates:$dates, startTime:$startTime, endTime:$endTime) @include(if: $includeByDay) {
          dates
          startTime
          endTime
          headways {
            median
          }
          scheduledHeadways {
            median
          }
          tripTimes {
            median
            percentiles(percentiles:[90]) { percentile value }
           }
          waitTimes {
            median
            percentiles(percentiles:[90]) { percentile value }
          }
          scheduledTripTimes {
            median
            percentiles(percentiles:[90]) { percentile value }
           }
          scheduledWaitTimes {
            median
            percentiles(percentiles:[90]) { percentile value }
          }
          departureScheduleAdherence {
            onTimeCount
            scheduledCount
          }
          arrivalScheduleAdherence {
            onTimeCount
            scheduledCount
          }
        }
      }
    }
  }
}
  `.replace(/\s+/g, ' ');

  const dates = computeDates(params.firstDateRange);

  return function(dispatch) {
    const variables = {
      agencyId: params.agencyId,
      routeId: params.routeId,
      directionId: params.directionId,
      startStopId: params.startStopId,
      endStopId: params.endStopId,
      dates,
      startTime: params.firstDateRange.startTime,
      endTime: params.firstDateRange.endTime,
      includeTimeRanges: !params.firstDateRange.startTime,
      includeByDay: !params.secondDateRange && dates.length > 1,
      includeTimeRanges2:
        !!params.secondDateRange && !params.secondDateRange.startTime,
      dualDateRange: !!params.secondDateRange,
    };
    if (params.secondDateRange) {
      variables.dates2 = computeDates(params.secondDateRange);
      variables.startTime2 = params.secondDateRange.startTime;
      variables.endTime2 = params.secondDateRange.endTime;
    }

    dispatch({ type: 'REQUEST_TRIP_METRICS' });
    axios
      .get('/api/graphql', {
        params: {
          query,
          variables: JSON.stringify(variables),
        }, // computed dates aren't in graphParams so add here
        baseURL: MetricsBaseURL,
      })
      .then(response => {
        const responseData = response.data;
        if (responseData && responseData.errors) {
          // assume there is at least one error, but only show the first one
          dispatch({
            type: 'ERROR_TRIP_METRICS',
            error: responseData.errors[0].message,
          });
        } else {
          const agencyMetrics =
            responseData && responseData.data ? responseData.data.agency : null;
          const routeMetrics = agencyMetrics ? agencyMetrics.route : null;
          const tripMetrics = routeMetrics ? routeMetrics.trip : null;
          dispatch({
            type: 'RECEIVED_TRIP_METRICS',
            data: tripMetrics,
          });
        }
      })
      .catch(err => {
        const errStr =
          err.response && err.response.data && err.response.data.errors
            ? err.response.data.errors[0].message
            : err.message;
        dispatch({ type: 'ERROR_TRIP_METRICS', error: errStr });
      });
  };
}

export function resetTripMetrics() {
  return function(dispatch) {
    dispatch({ type: 'RECEIVED_TRIP_METRICS', data: null });
  };
}

export function fetchRoutes() {
  return function(dispatch, getState) {
    const agencyId = Agencies[0].id;

    if (agencyId !== getState().routes.agencyId) {
      dispatch({ type: 'REQUEST_ROUTES', agencyId });
      axios
        .get(generateRoutesURL(agencyId))
        .then(response => {
          const routes = response.data.routes;
          routes.forEach((route, i) => {
            route.agencyId = agencyId;
            route.routeIndex = i;
          });
          dispatch({
            type: 'RECEIVED_ROUTES',
            data: routes,
            agencyId,
          });
        })
        .catch(err => {
          dispatch({ type: 'ERROR_ROUTES', error: err });
        });
    }
  };
}

export function fetchDownload(params) {
  const dates = computeDates(params.firstDateRange);
  // console.log('in fetchDownload found dates', dates);
  // console.log('getting dates[0]', dates[0]);
  const routeId = params.routeId ;

  const variables = {
    agencyId: Agencies[0].id,
    routeId: params.routeId,
    dates,
    directionId: params.directionId,
    startStopId: params.startStopId,
    endStopId: params.endStopId,
    startTime: params.firstDateRange.startTime,
    endTime: params.firstDateRange.endTime,
    dualDateRange: !!params.secondDateRange,
  };

  const variablesJson = JSON.stringify(variables);

  console.log('routeId', routeId);  

  let downloadFilename;

  if (dates.length === 1) {
    downloadFilename = `arrivals_${routeId}_${dates[0]}.csv`;
  } else {
    // when we don't have all params, clear graph data
    downloadFilename = `arrivals_${routeId}_${dates[0]}_${dates[1]}.csv`;
  }


    console.log('inside fetchDownload action routeId', params.routeId
    , 'directionId', params.directionId, 'dates', dates);

    axios.get(
      '/api/arrival_download', 
      {responseType: 'blob',
      params: { variables: variablesJson },
      baseURL: MetricsBaseURL,
    } 
    ).then((response) => {
      // copied from https://stackoverflow.com/questions/65212805/how-can-i-open-csv-file-received-from-axios-get-response-in-new-window
      // there might be a better way to download the file
      var url = window.URL.createObjectURL(response.data)
      var a = document.createElement('a')
      a.href = url
      a.download = downloadFilename
      a.click()
      a.remove()
      setTimeout(() => window.URL.revokeObjectURL(url), 100)
    });
    
  };

export function fetchRouteMetrics(params) {
  const dates = computeDates(params.firstDateRange);

  return function(dispatch, getState) {
    console.log('fetchRouteMetrics', params);
    const query = `
fragment intervalFields on RouteIntervalMetrics {
  directions {
    directionId
    medianHeadway
    medianWaitTime
    averageSpeed(units:"mph")
    completedTrips
    onTimeRate
    scheduledMedianHeadway
    scheduledMedianWaitTime
    scheduledAverageSpeed(units:"mph")
    scheduledCompletedTrips
    segments {
      fromStopId
      toStopId
      medianTripTime
      trips
    }
    cumulativeSegments {
      fromStopId
      toStopId
      medianTripTime
      scheduledMedianTripTime
      trips
      scheduledTrips
    }
  }
}

query($agencyId:String!, $routeId:String!,
    $dates:[String!], $startTime:String, $endTime:String,
    $dates2:[String!], $startTime2:String, $endTime2:String,
    $dualDateRange:Boolean!
) {
  agency(agencyId:$agencyId) {
    route(routeId:$routeId) {
      interval(dates:$dates, startTime:$startTime, endTime:$endTime) {
         ...intervalFields
      }
      interval2: interval(dates:$dates2, startTime:$startTime2, endTime:$endTime2) @include(if: $dualDateRange) {
         ...intervalFields
      }
    }
  }
}`.replace(/\s+/g, ' ');

    const variables = {
      agencyId: Agencies[0].id,
      routeId: params.routeId,
      dates,
      startTime: params.firstDateRange.startTime,
      endTime: params.firstDateRange.endTime,
      dualDateRange: !!params.secondDateRange,
    };
    if (params.secondDateRange) {
      variables.dates2 = computeDates(params.secondDateRange);
      variables.startTime2 = params.secondDateRange.startTime;
      variables.endTime2 = params.secondDateRange.endTime;
    }

    const variablesJson = JSON.stringify(variables);

    if (getState().routeMetrics.variablesJson !== variablesJson) {
      dispatch({
        type: 'REQUEST_ROUTE_METRICS',
        variablesJson,
      });
      axios
        .get('/api/graphql', {
          params: { query, variables: variablesJson }, // computed dates aren't in graphParams so add here
          baseURL: MetricsBaseURL,
        })
        .then(response => {
          const responseData = response.data;
          if (responseData && responseData.errors) {
            // assume there is at least one error, but only show the first one
            dispatch({
              type: 'ERROR_ROUTE_METRICS',
              error: responseData.errors[0].message,
            });
          } else {
            const agencyMetrics =
              responseData && responseData.data
                ? responseData.data.agency
                : null;
            const routeMetrics = agencyMetrics ? agencyMetrics.route : null;
            dispatch({
              type: 'RECEIVED_ROUTE_METRICS',
              variablesJson,
              data: routeMetrics,
            });
          }
        })
        .catch(err => {
          const errStr =
            err.response && err.response.data && err.response.data.errors
              ? err.response.data.errors[0].message
              : err.message;
          dispatch({ type: 'ERROR_ROUTE_METRICS', error: errStr });
        });
    }
  };
}

export function fetchAgencyMetrics(params) {
  const dates = computeDates(params.firstDateRange);

  return function(dispatch, getState) {
    const query = `query($agencyId:String!, $dates:[String!], $startTime:String, $endTime:String) {
  agency(agencyId:$agencyId) {
    agencyId
    interval(dates:$dates, startTime:$startTime, endTime:$endTime) {
      routes {
        routeId
        directions {
          directionId
          medianHeadway
          medianWaitTime
          averageSpeed(units:"mph")
          onTimeRate
        }
      }
    }
  }
}`.replace(/\s+/g, ' ');

    const variablesJson = JSON.stringify({
      agencyId: Agencies[0].id,
      dates,
      startTime: params.firstDateRange.startTime,
      endTime: params.firstDateRange.endTime,
    });

    if (getState().agencyMetrics.variablesJson !== variablesJson) {
      dispatch({
        type: 'REQUEST_AGENCY_METRICS',
        variablesJson,
      });
      axios
        .get('/api/graphql', {
          params: { query, variables: variablesJson },
          baseURL: MetricsBaseURL,
        })
        .then(response => {
          const responseData = response.data;
          if (responseData && responseData.errors) {
            // assume there is at least one error, but only show the first one
            dispatch({
              type: 'ERROR_AGENCY_METRICS',
              error: responseData.errors[0].message,
            });
          } else {
            const agencyMetrics =
              responseData && responseData.data
                ? responseData.data.agency
                : null;
            dispatch({
              type: 'RECEIVED_AGENCY_METRICS',
              variablesJson,
              data: agencyMetrics,
            });
          }
        })
        .catch(err => {
          const errStr =
            err.response && err.response.data && err.response.data.errors
              ? err.response.data.errors[0].message
              : err.message;
          dispatch({ type: 'ERROR_AGENCY_METRICS', error: errStr });
        });
    }
  };
}

/**
 * Action creator that fetches arrival history from S3 corresponding to the
 * day and route specified by params.
 *
 * @param params graphParams object
 */
export function fetchArrivals(params) {
  return function(dispatch, getState) {
    const dateStr = params.firstDateRange.date;
    const agencyId = params.agencyId;

    const s3Url = generateArrivalsURL(agencyId, dateStr, params.routeId);

    if (getState().arrivals.url !== s3Url) {
      dispatch({ type: 'REQUEST_ARRIVALS' });
      axios
        .get(s3Url)
        .then(response => {
          dispatch({
            type: 'RECEIVED_ARRIVALS',
            data: response.data,
            url: s3Url,
          });
        })
        .catch(() => {
          dispatch({ type: 'ERROR_ARRIVALS', error: 'No data.' });
        });
    }
  };
}

/**
 * Action creator that clears arrival history.
 */
export function resetArrivals() {
  return function(dispatch) {
    dispatch({ type: 'RECEIVED_ARRIVALS', url: null, data: null });
  };
}

export function handleSpiderMapClick(nearbyLines, latLng) {
  return function(dispatch) {
    dispatch({ type: 'RECEIVED_SPIDER_MAP_CLICK', nearbyLines, latLng });
  };
}

export function handleGraphParams(params) {
  return function(dispatch, getState) {
    const oldParams = getState().graphParams;
    dispatch({ type: 'RECEIVED_GRAPH_PARAMS', params });
    console.log('RECEIVED_GRAPH_PARAMS', params);
    const graphParams = getState().graphParams;

    if (
      oldParams.firstDateRange.date !== graphParams.firstDateRange.date ||
      oldParams.routeId !== graphParams.routeId ||
      oldParams.agencyId !== graphParams.agencyId
    ) {
      // Clear out stale data.  We have arrivals for a different route, day, or agency
      // from what is currently selected.
      dispatch(resetArrivals());
    }

    if (graphParams.firstDateRange.date) {
      dispatch(fetchAgencyMetrics(graphParams));
    }

    if (graphParams.agencyId && graphParams.routeId) {
      dispatch(fetchRouteMetrics(graphParams));
    }

    // fetch graph data if all params provided

    if (
      graphParams.agencyId &&
      graphParams.routeId &&
      graphParams.directionId &&
      graphParams.startStopId &&
      graphParams.endStopId
    ) {
      dispatch(fetchTripMetrics(graphParams));
    } else {
      // when we don't have all params, clear graph data
      dispatch(resetTripMetrics());
    }
  };
}

export function updateQuery(queryParams) {
  return function(dispatch, getState) {
    const currentLocation = getState().location;
    const newQuery = { ...currentLocation.query, ...queryParams };

    dispatch({
      type: currentLocation.type,
      payload: currentLocation.payload,
      query: newQuery,
    });
  };
}
