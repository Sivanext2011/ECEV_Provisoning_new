"""Sample UCIP/ACIP XML-RPC responses matching the LLD worked example.

Protocol per CPI: XML-RPC <methodResponse> with a <struct>. These fixtures are
fed through UcipClient._normalise_xmlrpc_response + the model parsers.

Master phone 886912345678 / Apple Watch 886955550000.
Basic 145001 (UT 50GB, UC 20GB, HighBandwidth=Speed1.5G, FlatRate=No)
Add-on 160006 (UT 50GB, UC 30GB) + carryover 5GB. ServiceClass 5101.
Derived: Basic acct 30GB/ctr 20GB; Add-on acct 20GB/ctr 30GB + carryover flag.
"""


def _member(name, inner):
    return f"<member><name>{name}</name><value>{inner}</value></member>"


def _s(name, text):
    return _member(name, f"<string>{text}</string>")


def _i(name, num):
    return _member(name, f"<int>{num}</int>")


def _struct(members):
    return "<struct>" + "".join(members) + "</struct>"


def _response(struct):
    return (
        '<?xml version="1.0"?><methodResponse><params><param><value>'
        + struct +
        "</value></param></params></methodResponse>"
    )


# --- GetAccountDetails -----------------------------------------------------
GET_ACCOUNT_DETAILS = _response(_struct([
    _i("responseCode", 0),
    _s("accountID", "886912345678"),
    _s("serviceClassCurrent", "5101"),
    _s("imsi", "466920000000001"),
    _s("languageIDCurrent", "2"),
    _s("supervisionExpiryDate", "20270131120000"),
]))


# --- GetOffers -------------------------------------------------------------
def _offer_struct(members):
    return "<value>" + _struct(members) + "</value>"


_offer_basic = _struct([
    _s("offerID", "145001"),
    _s("offerType", "1"),
    _s("startDate", "20260101"),
    _s("expiryDate", "20270131"),
    _member("offerAttribute", "<array><data>"
            "<value><struct>" + _s("name", "HighBandwidth") + _s("value", "Speed1.5G") + "</struct></value>"
            "<value><struct>" + _s("name", "FlatRate") + _s("value", "No") + "</struct></value>"
            "</data></array>"),
])
_offer_addon = _struct([
    _s("offerID", "160006"),
    _member("offerAttribute", "<array><data>"
            "<value><struct>" + _s("name", "HighBandwidth") + _s("value", "Speed1.5G") + "</struct></value>"
            "</data></array>"),
])
_offer_carry = _struct([
    _s("offerID", "160006_CARRYOVER"),
    _member("carriedAmount", "<string>5</string>"),
])

GET_OFFERS = _response(_struct([
    _i("responseCode", 0),
    _member("offer", "<array><data>"
            + "<value>" + _offer_basic + "</value>"
            + "<value>" + _offer_addon + "</value>"
            + "<value>" + _offer_carry + "</value>"
            + "</data></array>"),
]))


# --- GetBalanceAndDate -----------------------------------------------------
def _da(da_id, gb):
    return "<value>" + _struct([
        _s("dedicatedAccountID", da_id),
        _s("value", str(gb)),
        _s("expiryDate", "20270131"),
    ]) + "</value>"


GET_BALANCE_AND_DATE = _response(_struct([
    _i("responseCode", 0),
    _member("dedicatedAccountInformation",
            "<array><data>" + _da("6145000", 50) + _da("6160006", 50) + "</data></array>"),
]))


# --- GetAccumulators -------------------------------------------------------
def _acc(acc_id, gb):
    return "<value>" + _struct([_s("accumulatorID", acc_id), _s("value", str(gb))]) + "</value>"


GET_ACCUMULATORS = _response(_struct([
    _i("responseCode", 0),
    _member("accumulator",
            "<array><data>" + _acc("6145000", 20) + _acc("6160006", 30) + "</data></array>"),
]))


# --- GetMultiSubscriberNumbers --------------------------------------------
GET_MULTI = _response(_struct([
    _i("responseCode", 0),
    _s("masterNumber", "886912345678"),
    _member("subordinate", "<array><data>"
            "<value>" + _struct([
                _s("subordinateNumber", "886955550000"),
                _s("imsi", "466920000009999"),
            ]) + "</value>"
            "</data></array>"),
]))


RESPONSES = {
    "GetAccountDetails": GET_ACCOUNT_DETAILS,
    "GetOffers": GET_OFFERS,
    "GetBalanceAndDate": GET_BALANCE_AND_DATE,
    "GetAccumulators": GET_ACCUMULATORS,
    "GetMultiSubscriberNumbers": GET_MULTI,
}
